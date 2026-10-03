'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const account = require('../scripts/artizen-account');
const model = require('../scripts/participation-model');

const wallet = { address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd', chainId: 10 };
const entities = {
  me: { id: 'me', kind: 'creator', name: 'Me', publicWallet: wallet, sharedLocation: { label: 'Vermont', precision: 'country' } },
  party: { id: 'party', kind: 'project', name: 'Party' },
  kiln: { id: 'kiln', kind: 'project', name: 'Kiln', sharedLocation: { label: 'Oregon', precision: 'city' } },
  jukebox: { id: 'jukebox', kind: 'project', name: 'Jukebox' },
  other: { id: 'other', kind: 'project', name: 'Someone else' },
  f1: { id: 'f1', kind: 'fund', name: 'Fund One' },
  f2: { id: 'f2', kind: 'fund', name: 'Fund Two' },
  f3: { id: 'f3', kind: 'fund', name: 'Stewarded Fund' },
};
const edges = [
  { source: 'me', target: 'party', type: 'creator-associated' },
  { source: 'me', target: 'jukebox', type: 'creator-associated' },
  { source: 'party', target: 'kiln', type: 'associated-project' },
  { source: 'me', target: 'kiln', type: 'boosted', sourceLabel: 'Creator-declared' },
  { source: 'me', target: 'kiln', type: 'collected-artifacts', sourceLabel: 'Creator-declared' },
  { source: 'kiln', target: 'f1', type: 'submitted' },
  { source: 'jukebox', target: 'f1', type: 'funded' },
  { source: 'other', target: 'f2', type: 'curated' },
  { source: 'me', target: 'f2', type: 'fund-member' },
  { source: 'me', target: 'f3', type: 'fund-steward', sourceLabel: 'Participant-reported (unverified)' },
];

test('creator space separates own projects from supported ones, plus funds and stewardship', () => {
  const s = account.summarize(entities.me, edges, entities, null);
  assert.deepEqual(s.projects.map(p => p.project.id), ['jukebox', 'party'], 'an associated child is not the creator’s project');
  assert.deepEqual(s.supported.map(e => [e.entity.id, e.ways.sort()]), [['kiln', ['boosted', 'collected artifacts']]]);
  assert.deepEqual(s.collected.map(e => e.entity.id), ['kiln']);
  const f1 = s.funds.find(f => f.fund.id === 'f1');
  assert.deepEqual(f1.relations, ['funded']);
  assert.deepEqual(f1.via, ['Jukebox'], 'a supported project’s submissions are not attributed to the supporter');
  const f2 = s.funds.find(f => f.fund.id === 'f2');
  assert.equal(f2.reported, true);
  assert.deepEqual(f2.via, [], 'another creator’s project must not be attributed');
  assert.deepEqual(s.stewarded.map(e => e.fund.id), ['f3']);
});

test('wallet status compares case-insensitively and never claims verification', () => {
  const upper = { address: wallet.address.toUpperCase().replace('0X', '0x'), chainId: 10 };
  assert.equal(account.walletStatus(entities.me, null).state, 'declared-not-connected');
  assert.equal(account.walletStatus(entities.me, upper).state, 'declared-matches');
  assert.equal(account.walletStatus(entities.me, { ...upper, chainId: 1 }).state, 'declared-matches-other-network');
  assert.equal(account.walletStatus(entities.me, { address: '0x' + '1'.repeat(40), chainId: 10 }).state, 'declared-differs');
  assert.equal(account.walletStatus(entities.party, null).state, 'none-declared');
  const html = account.renderCreator(entities.me, {
    associations: edges, entitiesById: entities, connectedWallet: upper, networks: model.networks, esc: String,
  });
  assert.match(html, /not proof/);
  assert.match(html, /<fieldset disabled>/);
  assert.match(html, /Coming soon/);
  assert.doesNotMatch(html, /type="password"/);
});

test('creator location stays separate from project and fund locations', () => {
  const s = account.summarize({ ...entities.me, sharedLocation: undefined }, edges, entities, null);
  assert.equal(s.locations.creator, null);
  assert.equal(s.locations.projects.find(r => r.entity.id === 'party').location, null);
  assert.ok(!s.locations.projects.some(r => r.entity.id === 'kiln'));
  const html = account.renderCreator({ ...entities.me, sharedLocation: undefined }, {
    associations: edges, entitiesById: entities, connectedWallet: null, networks: model.networks, esc: String,
  });
  assert.match(html, /<strong>Creator:<\/strong> <span class="account-muted">not shared/);
});

test('fund-steward imports must connect a creator to a fund', () => {
  const known = [{ id: 'artizen-fund:f1', kind: 'fund', name: 'F' }, { id: 'artizen-project:p1', kind: 'project', name: 'P' }];
  const input = {
    format: 'decentcanopy-participation', version: 1, coverage: 'test',
    entities: [{ id: 'local-creator:a', kind: 'creator', name: 'A' }],
    connections: [{ source: 'local-creator:a', target: 'artizen-fund:f1', type: 'fund-steward' }],
    events: [],
  };
  assert.equal(model.validate(input, known).connections[0].sourceLabel, 'Participant-reported (unverified)');
  input.connections[0].target = 'artizen-project:p1';
  assert.throws(() => model.validate(input, known), /creator to a fund/);
});

test('public profile capture renders stats, totals, no memberships, supports, boosts, and no stewardship', () => {
  const me = {
    ...entities.me,
    artizenProfile: {
      pro: true, bio: 'genie', boostPoints: '77.8K', artTokens: '161.0K', projectCount: 2,
      recentBoosts: [{ name: 'Other project', slug: 'other' }, { name: 'Elsewhere.com' }],
      stewardship: [], fundMembershipNote: 'All fund submissions are still pending.', capturedAt: '2026-10-03', source: 'Artizen public creator profile',
    },
  };
  const ents = {
    ...entities, me,
    party: { ...entities.party, publicStats: { total: 1000, boosts: 3, capturedAt: '2026-10-03' } },
    kiln: { ...entities.kiln, publicStats: { total: 500, capturedAt: '2026-10-03' } },
    jukebox: { ...entities.jukebox, publicStats: { total: 293, boosts: 7, capturedAt: '2026-10-03' } },
    other: { ...entities.other, slug: 'other' },
  };
  const links = [
    ...edges.filter((edge) => !['fund-steward', 'fund-member'].includes(edge.type)),
    { source: 'me', target: 'other', type: 'boosted', sourceLabel: 'Artizen public profile' },
  ];
  const s = account.summarize(me, links, ents, null);
  assert.equal(s.totals.total, 1293);
  assert.equal(s.totals.boosts, 10);
  assert.deepEqual(s.boosted.map((entry) => entry.entity.id).sort(), ['kiln', 'other']);
  const html = account.renderCreator(me, { associations: links, entitiesById: ents, connectedWallet: null, networks: model.networks, esc: String });
  assert.match(html, /PRO/);
  assert.match(html, /\$1,293<\/strong> across 2 linked project pages/);
  assert.match(html, /Fund memberships \(0\)/);
  assert.match(html, /All fund submissions are still pending/);
  assert.match(html, /Projects you support \(2\)/);
  assert.match(html, /\$500 total · boosted \+ collected artifacts/);
  assert.match(html, /Fund submissions \(1\)/);
  assert.match(html, /A submission is not membership/);
  assert.match(html, /Artifact collection \(1\)/);
  assert.match(html, /Recent boosts \(3\)/);
  assert.match(html, /Elsewhere\.com/);
  assert.match(html, /<strong>None<\/strong>/);
  const viewerHtml = account.renderCreator(me, { associations: links, entitiesById: ents, connectedWallet: null, networks: model.networks, esc: String, viewerId: 'me' });
  assert.match(viewerHtml, /Your Artizen space/);
  assert.match(viewerHtml, /local preference, not verified/);
});

test('participant Artizen profile links must point to artizen.fund', () => {
  const input = {
    format: 'decentcanopy-participation', version: 1, coverage: 'test',
    entities: [{ id: 'local-creator:me', kind: 'creator', name: 'Me', artizenProfileUrl: 'https://artizen.fund/index/u/me' }],
    connections: [], events: [],
  };
  const bundle = model.validate(input, []);
  assert.equal(bundle.entities[0].artizenProfileUrl, 'https://artizen.fund/index/u/me');
  const applied = model.apply({ projects: [], associations: [], activity: [] }, bundle);
  assert.equal(applied.projects[0].artizenPageUrl, 'https://artizen.fund/index/u/me');
  input.entities[0].artizenProfileUrl = 'https://evil.example/artizen.fund';
  assert.throws(() => model.validate(input, []), /artizen\.fund/);
  input.entities[0].artizenProfileUrl = 'http://artizen.fund/x';
  assert.throws(() => model.validate(input, []), /HTTPS/);
});
