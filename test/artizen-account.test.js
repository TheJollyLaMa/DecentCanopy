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
  { source: 'kiln', target: 'f1', type: 'submitted' },
  { source: 'jukebox', target: 'f1', type: 'funded' },
  { source: 'other', target: 'f2', type: 'curated' },
  { source: 'me', target: 'f2', type: 'fund-member' },
  { source: 'me', target: 'f3', type: 'fund-steward', sourceLabel: 'Participant-reported (unverified)' },
];

test('creator space derives projects, child projects, funds, and reported stewardship', () => {
  const s = account.summarize(entities.me, edges, entities, null);
  assert.deepEqual(s.projects.map(p => p.project.id), ['jukebox', 'kiln', 'party']);
  assert.equal(s.projects.find(p => p.project.id === 'kiln').through.id, 'party');
  const f1 = s.funds.find(f => f.fund.id === 'f1');
  assert.deepEqual(f1.relations.sort(), ['funded', 'submitted']);
  assert.deepEqual(f1.via.sort(), ['Jukebox', 'Kiln']);
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
  assert.equal(s.locations.projects.find(r => r.entity.id === 'kiln').location.label, 'Oregon');
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
