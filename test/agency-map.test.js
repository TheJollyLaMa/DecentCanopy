'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Model = require('../scripts/data-adapter/agency-adapter');
const Cards = require('../scripts/agency-map');
const Share = require('../scripts/share-view');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const fixture = () => JSON.parse(read('data/agency-map.json'));
const escape = value => String(value ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const id = key => `agency-project:${key}`;

test('all requested names survive as projects, with separate public repo identities and unknown funding', () => {
  const data = fixture();
  const before = JSON.stringify(data);
  const graph = Model.transform(data);
  assert.equal(JSON.stringify(data), before);
  const expected = [
    'DecentAgency', 'DecentCanopy', 'DecentBusking', 'DecentJukebox', 'BigNuten_Vanilla',
    'TheGreenTeaParty', 'GreenTeaHut_01', 'ArtFi', 'JacobsLadder26', 'DecentMaker',
    'JollySimSiddhi', 'Arduino Smarthome', 'cadCAD', 'TheUmbrellaAcademy',
    'AJollyDecentCodeCamp', 'JollySandbox', 'DecentSubscriptions', 'DecentPilgrimages',
    'DecentHead', 'DecentCanvas', 'DecentFooter', 'DecentMarket', 'DecentEscrow',
    'DecentInvoice', 'DecentAirdrop', 'DecentCalendar', 'Decent_NDA', 'Decent_UCANN_Play',
    'DuoDuel', 'BabelBet', 'BabelBet_OG_Prototype', 'TheJokerWillPlay', 'Bean', 'Asteroid'
  ];
  assert.deepEqual(graph.projects.filter(n => n.kind !== 'repository').map(n => n.name).sort(), expected.sort());
  assert.equal(new Set(graph.projects.map(n => n.id)).size, graph.projects.length);
  assert.equal(graph.projects.filter(n => n.kind === 'repository').length, data.projects.filter(p => p.repo).length);
  graph.projects.forEach(node => {
    assert.equal(node.raised, null);
    assert.equal(node.goal, null);
    assert.ok(node.agencyDetails.currentState);
    assert.ok(node.agencyDetails.nextAction);
  });
  assert.equal(graph.metrics.availableFunds, null);
  assert.deepEqual(graph.activity, []);
  const known = new Set(graph.projects.map(n => n.id));
  graph.associations.forEach(edge => {
    assert.ok(known.has(edge.source) && known.has(edge.target));
    assert.ok(Model.STATES[edge.relationshipState]);
    assert.ok(edge.note);
    assert.equal(edge.decentClaim, undefined);
  });
});

test('focus, external scope, unresolved identities, and reported payouts remain explicit', () => {
  const graph = Model.transform(fixture());
  assert.deepEqual(graph.projects.filter(n => n.kind === 'project' && n.status === 'now').map(n => n.name).sort(),
    ['DecentBusking', 'DecentCanopy']);
  assert.deepEqual(graph.projects.filter(n => n.kind === 'project' && n.status === 'next').map(n => n.name), ['BigNuten_Vanilla']);
  assert.ok(!graph.associations.some(a => a.type === 'under-umbrella' && a.target === id('cadcad')));
  assert.equal(graph.projects.find(n => n.name === 'Bean').repoUrl, null);
  assert.equal(graph.projects.find(n => n.name === 'BabelBet_OG_Prototype').repoUrl, null);
  const busking = graph.projects.find(n => n.id === id('decent-busking'));
  assert.match(busking.agencyDetails.currentState, /steward reports/);
  assert.match(busking.agencyDetails.currentState, /not reconciled/);
  const reuse = graph.associations.find(a => a.source === id('decent-busking') && a.target === id('big-nuten'));
  assert.equal(reuse.relationshipState, 'proposed');
  assert.ok(reuse.evidence.some(row => row.url.endsWith('/issues/337')));
  const lineage = graph.associations.find(a => a.source === id('decent-jukebox') && a.target === busking.id);
  assert.equal(lineage.relationshipState, 'reported');
});

test('invalid versions, identifiers, dates, evidence, and unsupported relationship claims fail explicitly', () => {
  const mutations = [
    d => { d.version = 99; },
    d => { d.reviewedAt = '2026-02-30'; },
    d => { d.projects[1].id = d.projects[0].id; },
    d => { d.projects[0].kind = 'fund'; },
    d => { d.projects[0].focus = 'finished'; },
    d => { d.projects[0].repo = 'https://github.com/owner/repo'; },
    d => { d.projects[0].repo = 'owner/..'; },
    d => { d.projects[0].tags = 'ipfs'; },
    d => { d.projects[0].currentState = {}; },
    d => { d.relationships[0].target = 'missing'; },
    d => { d.relationships[0].state = 'ledger'; },
    d => { d.relationships[0].state = 'observed'; },
    d => { d.relationships[0].note = ''; },
    d => { d.projects[1].evidence[0].url = 'javascript:alert(1)'; },
    d => { d.projects[1].evidence[0].url = 'https://user:password@example.org'; }
  ];
  mutations.forEach(mutate => {
    const data = fixture();
    mutate(data);
    assert.throws(() => Model.transform(data));
  });
});

test('repository nodes deduplicate case-insensitively and keep every project association', () => {
  const data = fixture();
  data.projects.push({ id: 'another-project', name: 'Another project', repo: 'thejollylama/DecentBusking' });
  const graph = Model.transform(data);
  const repoId = 'github-repo:thejollylama/decentbusking';
  assert.equal(graph.projects.filter(n => n.id === repoId).length, 1);
  assert.equal(graph.associations.filter(a => a.type === 'repository-link' && a.target === repoId).length, 2);
});

test('cards explain direction, uncertainty, reuse context, existing issues, and escape curated text', () => {
  const data = fixture();
  data.projects.find(p => p.id === 'big-nuten').purpose = '<img src=x onerror=alert(1)>';
  const graph = Model.transform(data);
  const entities = Object.fromEntries(graph.projects.map(n => [n.id, n]));
  const html = Cards.render(entities[id('big-nuten')], entities, graph.associations, escape, Model);
  assert.match(html, /Incoming from DecentBusking/);
  assert.match(html, /Proposed only/);
  assert.match(html, /issues\/337/);
  assert.match(html, /issues\/339/);
  assert.match(html, /not been reproduced/);
  assert.match(html, /payout status: unavailable/);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img|Frozen historical|Artizen record|\$0|0% funded|ledger-verified/i);
});

test('agency adapter fetches once across shared selectors and does not replace unavailable data', async () => {
  let requests = 0;
  const sandbox = {
    window: {}, console,
    fetch: async url => {
      requests++;
      assert.equal(url, '/site/data/agency-map.json');
      return { ok: true, json: async () => fixture() };
    }, URL
  };
  vm.runInNewContext(read('scripts/data-adapter/agency-adapter.js'), sandbox);
  const adapter = sandbox.GTPAgencyDataAdapter.create({ basePath: '/site/' });
  const [projects, edges, metrics] = await Promise.all([adapter.getProjects(), adapter.getAssociations(), adapter.getMetrics()]);
  assert.equal(requests, 1);
  assert.ok(projects.length && edges.length);
  assert.equal(metrics.availableFunds, null);
  sandbox.fetch = async () => ({ ok: false, status: 503 });
  const failed = sandbox.GTPAgencyDataAdapter.create();
  await assert.rejects(failed.getProjects(), /HTTP 503/);
  sandbox.fetch = async () => ({ ok: true, json: async () => fixture() });
  assert.ok((await failed.getProjects()).length);
});

test('shared data layer preserves map metadata without overlaying creators or frozen archive', async () => {
  const sandbox = {
    window: {
      location: { search: '?canopy=agency' }, GTPAgencyDataAdapter: Model,
      CanopyParticipation: { overlay() { throw new Error('Unexpected participation overlay'); } },
      DecentCreators: { overlay() { throw new Error('Unexpected signed-record overlay'); } }
    },
    URL, URLSearchParams, console,
    GTPModeRouter: { getModeInfo: () => ({ mode: 'prototype' }) },
    fetch: async () => ({ ok: true, json: async () => fixture() })
  };
  vm.runInNewContext(read('scripts/data-adapter/agency-adapter.js'), sandbox);
  sandbox.window.GTPAgencyDataAdapter = sandbox.GTPAgencyDataAdapter;
  vm.runInNewContext(read('scripts/data-adapter/interface.js'), sandbox);
  vm.runInNewContext(read('scripts/data-layer.js'), sandbox);
  await sandbox.GTPData.load();
  assert.equal(sandbox.GTPData.getModeInfo().mode, 'agency');
  assert.ok(sandbox.GTPData.getProjectById(id('big-nuten')).agencyDetails);
  assert.equal(sandbox.GTPData.getAdapterMetrics().availableFunds, null);
  assert.ok(sandbox.GTPData.getAssociations().some(a => a.relationshipState === 'proposed' && a.evidence.length));
  sandbox.GTPData.setFilter('status', 'now');
  assert.equal(sandbox.GTPData.filterProjects().filter(n => n.kind === 'project').length, 2);
});

test('map ships through both publication paths and view links preserve agency context', () => {
  const files = require('../scripts/siteFiles').listSiteFiles();
  for (const file of ['data/agency-map.json', 'scripts/agency-map.js', 'scripts/data-adapter/agency-adapter.js']) {
    assert.ok(files.includes(file));
  }
  assert.ok(require('../scripts/pinDataBackup').DATA_FILES.includes('data/agency-map.json'));
  assert.match(read('.github/workflows/pin-ipfs-backup.yml'), /data\/agency-map\.json/);
  assert.match(read('.github/workflows/validate-payroll-queue.yml'), /node --test .*test\/agency-map\.test\.js/);
  const html = read('index.html');
  assert.ok(html.indexOf('scripts/data-adapter/agency-adapter.js') < html.indexOf('scripts/data-layer.js'));
  assert.ok(html.includes('id="agency-index"'));
  const url = Share.create('https://example.org/ipfs/bafyexample/?canopy=agency', { entity: id('big-nuten'), status: 'next' });
  assert.equal(new URL(url).searchParams.get('canopy'), 'agency');
  assert.equal(Share.read(url).entity, id('big-nuten'));
});
