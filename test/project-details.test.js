'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Records = require('../scripts/creator-records');
const Details = require('../scripts/project-details');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const json = file => JSON.parse(read(file));
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function graph() {
  const sandbox = { window: {} };
  vm.runInNewContext(read('scripts/data-adapter/artizen-adapter.js'), sandbox);
  return sandbox.window.GTPArtizenDataAdapter.transform(json('data/artizen.json'), json('data/artizen-curation.json'), null, json('data/project-details.json'));
}

test('adapter loads project details from bundled data and site/backup packages retain the record', async () => {
  const requested = [];
  const sandbox = { window: {}, fetch: async url => {
    requested.push(url);
    return { ok: true, json: async () => json(url) };
  } };
  vm.runInNewContext(read('scripts/data-adapter/artizen-adapter.js'), sandbox);
  const adapter = sandbox.window.GTPArtizenDataAdapter.create();
  const projects = await adapter.getProjects();
  assert.ok(requested.includes('data/project-details.json'));
  assert.equal(projects.find(p => p.slug === 'green-tea-hut-1').projectDetails.stage, 'Materials & Equipment Gathering');
  assert.ok(require('../scripts/siteFiles').listSiteFiles().includes('data/project-details.json'));
  assert.ok(require('../scripts/siteFiles').listSiteFiles().includes('scripts/project-details.js'));
  assert.ok(require('../scripts/pinDataBackup').DATA_FILES.includes('data/project-details.json'));
});

test('existing Hut registration remains in the project cluster with verified details and unknown amounts', () => {
  const base = graph(), hut = base.projects.find(p => p.slug === 'green-tea-hut-1');
  assert.equal(base.projects.filter(p => p.slug === 'green-tea-hut-1').length, 1);
  const party = base.projects.find(p => p.slug === 'green-tea-party');
  assert.ok(base.associations.some(edge => edge.source === party.id && edge.target === hut.id && edge.type === 'associated-project'));
  assert.equal(hut.name, 'Green Tea Hut #1');
  assert.equal(hut.raised, null);
  assert.equal(hut.goal, null);
  assert.equal(hut.projectDetails.stage, 'Materials & Equipment Gathering');
  assert.equal(hut.projectDetails.location, null);
  assert.equal(hut.projectDetails.outcomes, null);
  assert.equal(hut.projectDetails.treasury.address, '0xf75d1688D01fE29235B3bde450B615e4f3d2254A');
  assert.equal(hut.projectDetails.treasury.chainId, 8453);
  assert.equal(hut.projectDetails.treasury.status, 'active');
  assert.equal(hut.projectDetails.treasury.contract, 'ProjectTreasuryV2');
  assert.equal(hut.projectDetails.treasury.previousBaseTreasury.status, 'retired');
  assert.equal(hut.projectDetails.treasury.previousBaseTreasury.address, '0x757B1F856f2Faea5a661820f9da56af032B1F9a1');
  assert.deepEqual(hut.projectDetails.treasury.assets, ['ETH', 'USDC']);
  assert.equal(hut.projectDetails.accountingLedger.chainId, 10);
  assert.equal(hut.projectDetails.accountingLedger.role, 'accounting-only');
  const html = Details.render(hut, escape);
  for (const url of [hut.projectDetails.repoUrl, hut.projectDetails.ledgerUrl]) assert.ok(html.includes(url));
  assert.doesNotMatch(html, /artizen\.fund/);
  assert.match(html, /Current funding total: Unavailable · Funding goal: Unavailable/);
  assert.match(html, /Location: Unavailable · Outcomes: Unavailable/);
  assert.match(html, /Do not deposit funds to this address/);
  assert.match(html, /deposit on Base only/);
  assert.match(html, /BaseScan contract/);
  assert.match(html, /Passed checks: ETH deposit and payout; Base USDC deposit and payout/);
  assert.match(html, /balances and funding totals are unavailable/);
  assert.match(html, /0x807061DF657A7697c04045dA7d16D941861cAABc/);
  assert.match(html, /https:\/\/basescan\.org\/address\/0xf75d1688D01fE29235B3bde450B615e4f3d2254A/);
  assert.match(html, /https:\/\/basescan\.org\/address\/0x757B1F856f2Faea5a661820f9da56af032B1F9a1/);
  assert.match(html, /Previous Base treasury .* is retired/);
  assert.match(html, /Treasury page/);
  assert.match(html, /https:\/\/optimistic\.etherscan\.io\/address\/0x44500FFd99B621620f393FCdbcF55D5137A55A23/);
  assert.doesNotMatch(html, /deposit funds to this address.{0,120}Optimism/i);
  assert.doesNotMatch(html, /<button|ethereum:|0%|Goal reached|\$0/);
});

test('signed projection and normalized data retain null funding without mutating signed records or archive', async () => {
  const base = graph(), entries = json('data/decent-creators.json').creators;
  const before = JSON.stringify({ base, entries });
  const projected = Records.apply(base, entries);
  const hut = projected.projects.find(p => p.creatorProjectKey && p.name === 'Green Tea Hut #1');
  assert.ok(hut.projectDetails);
  assert.equal(hut.raised, null);
  assert.equal(hut.goal, null);
  assert.equal(JSON.stringify({ base, entries }), before);
  const sandbox = {
    window: { location: { search: '?canopy=green-tea' } }, URLSearchParams, console,
    GTPModeRouter: { getModeInfo: () => ({ mode: 'prototype' }) },
    GTPDataAdapterInterface: { assertAdapter: adapter => adapter },
    GTPArtizenDataAdapter: { create: () => ({
      getProjects: async () => projected.projects, getAssociations: async () => projected.associations,
      getActivity: async () => [], getMetrics: async () => ({})
    }) }
  };
  vm.runInNewContext(read('scripts/data-layer.js'), sandbox);
  await sandbox.GTPData.load();
  const normalized = sandbox.GTPData.getProjectById(hut.id);
  assert.equal(normalized.raised, null);
  assert.equal(normalized.goal, null);
  assert.equal(normalized.projectDetails.stage, hut.projectDetails.stage);
  assert.ok(sandbox.GTPData.getProjectById(base.projects.find(p => p.slug === 'green-tea-hut-1').id));
});

test('details appear on signed project blip and creator project summary without adding wallet authority', async () => {
  const index = json('data/decent-creators.json');
  const sandbox = {
    window: { CanopyProjectDetails: Details, DecentCreatorImages: { imageUrl: url => url } },
    location: { hostname: 'localhost', href: 'http://localhost/index.html' }, console, URL, AbortSignal,
    document: { addEventListener() {}, getElementById: () => ({ textContent: '' }) },
    localStorage: { getItem: () => null },
    DecentLedgerProof: { CHAINS: {}, browserCache: () => ({}), verifyGraph: async () => {} },
    ethers: { verifyMessage() {} },
    DecentCreatorRecords: { ...Records, verify: entry => entry.record },
    fetch: async () => ({ ok: true, json: async () => index })
  };
  vm.runInNewContext(read('scripts/decent-creators.js'), sandbox);
  const projected = await sandbox.window.DecentCreators.overlay(graph());
  const hut = projected.projects.find(p => p.creatorProjectKey && p.name === 'Green Tea Hut #1');
  const creator = projected.projects.find(p => p.kind === 'creator' && p.creatorRecord === hut.creatorRecord);
  for (const node of [hut, creator]) {
    const html = sandbox.window.DecentCreators.renderDetails(node, escape);
    assert.match(html, /Materials &amp; Equipment Gathering/);
    assert.match(html, /Do not deposit funds to this address/);
    assert.match(html, /Repository-curated project details; separate from/);
    assert.match(html, /Current funding total: Unavailable/);
  }
  assert.equal(hut.publicWallet, undefined);
  assert.match(sandbox.window.DecentCreators.renderDetails(hut, escape), /deposit on Base only/);
  assert.equal(hut.creatorRecord.projects.find(p => p.key === hut.creatorProjectKey).wallet, '');
  assert.match(read('scripts/spiral.js'), /CanopyProjectDetails\.render\(node, escHtml\)/);
  const page = read('index.html');
  assert.ok(page.indexOf('scripts/project-details.js') < page.indexOf('scripts/decent-creators.js'));
});

test('renderer ignores absent details and rejects executable links while escaping labels', () => {
  assert.equal(Details.render({}, escape), '');
  const d = graph().projects.find(p => p.slug === 'green-tea-hut-1').projectDetails;
  const html = Details.render({ projectDetails: { ...d, stage: '<img onerror=alert(1)>',
    repoUrl: 'javascript:alert(1)', ledgerUrl: 'https://user:pass@example.org', campaignUrl: 'http://example.org' } }, escape);
  assert.doesNotMatch(html, /<img|javascript:|user:pass|http:\/\/example/);
  assert.match(html, /&lt;img onerror=alert\(1\)&gt;/);
});
