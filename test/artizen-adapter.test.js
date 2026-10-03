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
