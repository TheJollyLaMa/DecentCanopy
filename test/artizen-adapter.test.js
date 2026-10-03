'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const adapterPath = path.join(__dirname, '..', 'scripts', 'data-adapter', 'artizen-adapter.js');
const snapshotPath = path.join(__dirname, '..', 'data', 'artizen.json');
const curationPath = path.join(__dirname, '..', 'data', 'artizen-curation.json');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(adapterPath, 'utf8'), sandbox, { filename: adapterPath });
const { transform } = sandbox.window.GTPArtizenDataAdapter;

function fixture() {
  return {
    generatedAt: '2026-09-07T07:43:04.345Z',
    projects: [
      {
        id: 'project-1',
        slug: 'example-project',
        name: 'Example project',
        description: 'A public project record.',
        tags: ['Community'],
        facets: ['domain:community-economy']
      }
    ],
    funds: [
      {
        id: 'fund-1',
        slug: 'example-fund',
        name: 'Example fund',
        available: 1250,
        active: true
      }
    ],
    relationships: [
      {
        projectId: 'project-1',
        fundId: 'fund-1',
        kind: 'submitted',
        seasonNumber: 7,
        createdAt: '2026-08-01T00:00:00.000Z'
      }
    ]
  };
}

test('transforms Artizen records into typed project/fund graph entities', () => {
  const data = transform(fixture(), { projects: [], associations: [] });
  const project = data.projects.find((entity) => entity.kind === 'project');
  const fund = data.projects.find((entity) => entity.kind === 'fund');

  assert.equal(project.id, 'artizen-project:project-1');
  assert.equal(project.description, 'A public project record.');
  assert.equal(project.track, 'Projects');
  assert.equal(fund.id, 'artizen-fund:fund-1');
  assert.equal(fund.available, 1250);
  assert.equal(project.artizenPageUrl, 'https://artizen.fund/index/p/example-project');
  assert.equal(fund.artizenPageUrl, 'https://artizen.fund/index/mf/example-fund');
  assert.equal(data.associations.length, 1);
  assert.equal(data.associations[0].type, 'submitted');
  assert.deepEqual(Array.from(data.associations[0].seasonNumbers), [7]);
  assert.equal(data.metrics.generatedAt, fixture().generatedAt);
});

test('adds creator-curated links and flags entries absent from the Artizen feed', () => {
  const data = transform(fixture(), {
    creator: { id: 'curator:thejollylama', name: 'TheJollyLaMa' },
    projects: [
      { slug: 'example-project', name: 'Example project' },
      { slug: 'qart-code', name: 'qArt-code', searchUrl: 'https://artizen.fyi/search?q=qArt-code' }
    ],
    associations: [
      {
        source: 'creator',
        targetSlug: 'example-project',
        type: 'creator-associated',
        sourceLabel: 'Creator-curated by TheJollyLaMa'
      },
      {
        sourceSlug: 'example-project',
        targetSlug: 'qart-code',
        type: 'associated-project',
        sourceLabel: 'Creator-curated by TheJollyLaMa'
      }
    ]
  });

  const qartCode = data.projects.find((entity) => entity.name === 'qArt-code');
  assert.equal(qartCode.dataState, 'not-in-feed');
  assert.equal(qartCode.artizenUrl, 'https://artizen.fyi/search?q=qArt-code');
  assert.equal(data.associations.length, 3);
  assert.equal(data.associations.filter((edge) => edge.sourceLabel.includes('Creator-curated')).length, 2);
});

test('rejects snapshots that do not provide relationship arrays', () => {
  assert.throws(
    () => transform({ projects: [], funds: [] }, null),
    /relationships to be an array/
  );
});

test('current snapshot resolves the stated Green Tea Party project cluster', () => {
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const curation = JSON.parse(fs.readFileSync(curationPath, 'utf8'));
  const data = transform(snapshot, curation);
  const idsByName = new Map(data.projects.map((entity) => [entity.name, entity.id]));
  const expected = [
    'The Green Tea Party',
    'DeCent Canopy',
    'Green Tea Party Kiln',
    'Green Tea Hut #1',
    'BigNuten',
    'Decent Jukebox',
    'qArt-code'
  ];
  expected.forEach((name) => assert.ok(idsByName.has(name), `${name} should appear in the canopy`));

  const partyId = idsByName.get('The Green Tea Party');
  for (const name of ['DeCent Canopy', 'Green Tea Party Kiln', 'Green Tea Hut #1']) {
    const association = data.associations.find((edge) =>
      edge.source === partyId && edge.target === idsByName.get(name)
      && edge.type === 'associated-project'
    );
    assert.ok(association, `${name} should connect to The Green Tea Party`);
    if (name === 'DeCent Canopy') {
      assert.match(association.note, /first meeting minutes/);
    }
  }
  const creatorId = 'curator:thejollylama';
  for (const name of ['BigNuten', 'Decent Jukebox', 'qArt-code', 'The Green Tea Party']) {
    assert.ok(data.associations.some((edge) =>
      edge.source === creatorId && edge.target === idsByName.get(name)
      && edge.sourceLabel.includes('Creator-curated')
    ), `${name} should retain its creator-curated association`);
  }
  const curationOnlyProjects = curation.projects.filter((project) =>
    !snapshot.projects.some((record) => record.slug === project.slug)
  ).length;
  assert.equal(data.projects.length, snapshot.projects.length + snapshot.funds.length + curationOnlyProjects + 1);
  assert.equal(data.metrics.sourceCounts.relationships, snapshot.relationships.length);
});

test('current curation fills TheJollyLaMa’s card with public links, stats, memberships, and a boost', () => {
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const curation = JSON.parse(fs.readFileSync(curationPath, 'utf8'));
  const data = transform(snapshot, curation);
  const byName = new Map(data.projects.map((entity) => [entity.name, entity]));
  const creatorId = 'curator:thejollylama';
  const creator = data.projects.find((entity) => entity.id === creatorId);
  assert.equal(creator.artizenProfile.pro, true);
  assert.deepEqual(Array.from(creator.artizenProfile.stewardship), []);

  const discord = 'https://discord.gg/tkBfwT3YMN';
  for (const name of ['Decent Jukebox', 'BigNuten', 'qArt-code', 'The Green Tea Party', 'DeCent Canopy', 'Green Tea Hut #1', 'ArtFi']) {
    const project = byName.get(name);
    assert.ok(project, `${name} should be in the canopy`);
    assert.ok(project.curatedLinks.some((link) => link.url === discord), `${name} should link the Decent Agency Discord`);
    assert.ok(project.curatedLinks.some((link) => /^https:\/\//.test(link.url) && /Website/.test(link.label)), `${name} should have a website`);
    assert.equal(typeof project.publicStats.total, 'number');
    assert.match(project.artizenPageUrl, /^https:\/\/artizen\.fund\/index\/p\//);
    assert.ok(data.associations.some((edge) => edge.source === creatorId && edge.target === project.id && edge.type === 'creator-associated'));
  }
  assert.match(byName.get('Decent Jukebox').curatedLinks[0].url, /DecentBusking/);
  const kilnId = byName.get('Green Tea Party Kiln').id;
  const kilnEdges = data.associations.filter((edge) => edge.source === creatorId && edge.target === kilnId);
  assert.deepEqual([...kilnEdges.map((edge) => edge.type)].sort(), ['boosted', 'collected-artifacts'],
    'The Kiln is Mama’s project: TheJollyLaMa only supports it and never claims it');
  assert.match(byName.get('Green Tea Party Kiln').curationNote, /Mama/);

  assert.equal(data.associations.filter((edge) => edge.source === creatorId && edge.type === 'fund-member').length, 0,
    'pending fund submissions are not memberships');
  assert.equal(data.associations.filter((edge) => edge.source === creatorId && edge.type === 'boosted').length, 2);
  const creatorEntity = data.projects.find((entity) => entity.id === creatorId);
  assert.match(creatorEntity.image, /cdn\.bubble\.io\/.*UmbrellaMan\.png$/);
  assert.ok(byName.get('BigNuten').image, 'snapshot artwork passes through');
});
