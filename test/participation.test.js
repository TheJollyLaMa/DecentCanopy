'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const model = require('../scripts/participation-model');
const base = {
  projects: [
    { id: 'artizen-project:p1', kind: 'project', name: 'A project', raised: 0, goal: 0 },
    { id: 'artizen-fund:f1', kind: 'fund', name: 'A fund', raised: 0, goal: 0 },
  ],
  associations: [], activity: [],
};
function fixture() {
  return {
    format: 'decentcanopy-participation', version: 1,
    coverage: 'My partial exported history, season 7',
    entities: [
      { id: 'local-creator:alice', kind: 'creator', name: 'Alice', websiteUrl: 'https://example.org' },
      { id: 'artizen-project:p1', kind: 'project', name: 'A project', funding: {
        raised: 500, goal: 1000, season: 7, currency: 'USD', asOf: '2026-10-03T12:00:00Z',
      } },
    ],
    connections: [{ source: 'local-creator:alice', target: 'artizen-project:p1', type: 'creator-associated' }],
    events: [
      { id: 'b1', type: 'boost', actor: 'local-creator:alice', target: 'artizen-project:p1', amount: 3, date: '2026-10-02T12:00:00Z', verified: true },
      { id: 'p1', type: 'purchase', target: 'artizen-project:p1', amount: 100, currency: 'USD', date: '2026-10-03T12:00:00Z' },
    ],
  };
}

test('participant imports preserve scope and do not promote untrusted verification claims', () => {
  const bundle = model.validate(fixture(), base.projects);
  assert.equal(bundle.events[0].sourceLabel, 'Participant-reported (unverified)');
  assert.equal(bundle.events[0].verified, undefined);
  assert.equal(bundle.events[1].actor, null);
  assert.equal(bundle.coverage, fixture().coverage);
});

test('overlays preserve public records and keep funding and activity separate', () => {
  const result = model.apply(base, model.validate(fixture(), base.projects));
  assert.equal(result.projects[0].raised, 500);
  assert.equal(result.projects[0].goal, 1000);
  assert.equal(result.projects[0].name, 'A project');
  assert.equal(base.projects[0].raised, 0);
  assert.equal(result.projects.at(-1).participationEvents.length, 1);
  assert.equal(result.associations.length, 1);
  assert.equal(result.projects[0].participationEvents.length, 2);
});

test('unknown ids, mismatched kinds, duplicate events and malformed money are rejected', () => {
  for (const mutate of [
    d => { d.events[0].target = 'missing'; },
    d => { d.entities[1].kind = 'fund'; },
    d => { d.events.push(d.events[0]); },
    d => { d.entities[1].funding.raised = -1; },
    d => { d.entities[1].funding.goal = Infinity; },
    d => { d.entities[1].funding.currency = 'ART'; },
    d => { d.events[0].amount = 1.2; },
    d => { d.events[0].date = 'yesterday'; },
    d => { d.connections[0].type = 'verified-purchase'; },
    d => { d.connections[0].type = 'fund-member'; },
    d => { d.connections.push(d.connections[0]); },
    d => { d.events[0].target = 'local-creator:alice'; },
    d => { d.events[0].actor = 'artizen-project:p1'; },
  ]) {
    const input = fixture();
    mutate(input);
    assert.throws(() => model.validate(input, base.projects));
  }
});

test('imports drop unknown account secrets and reject oversized record arrays', () => {
  const input = fixture();
  input.password = 'not-a-real-secret';
  input.entities[0].sessionCookie = 'not-a-real-cookie';
  const result = model.validate(input, base.projects);
  assert.equal(result.password, undefined);
  assert.equal(result.entities[0].sessionCookie, undefined);
  input.events = Array(1001).fill(input.events[0]);
  assert.throws(() => model.validate(input, base.projects), /at most 1000/);
});

test('counter changes cannot become creator-attributed boost histories', () => {
  const input = fixture();
  input.events[0].type = 'counter-change';
  assert.throws(() => model.validate(input, base.projects), /cannot be attributed/);
  delete input.events[0].actor;
  assert.equal(model.validate(input, base.projects).events[0].actor, null);
});

test('website drafts reject executable schemes and credentials and can be removed', () => {
  for (const url of ['javascript:alert(1)', 'http://example.org', 'https://user:pass@example.org']) {
    assert.throws(() => model.website(url));
  }
  assert.equal(model.website('https://example.org/path'), 'https://example.org/path');
  const result = model.apply(base, model.validate(fixture(), base.projects), { 'local-creator:alice': '' });
  assert.equal(result.projects.at(-1).websiteUrl, null);
});

test('public wallet links accept supported chains, normalize addresses and reject bad values', () => {
  const address = '0xAbCd111111111111111111111111111111111111';
  for (const chainId of [1, 10, 8453]) {
    assert.equal(model.wallet({ address, chainId }).address, address.toLowerCase());
  }
  for (const input of [
    { address, chainId: 56 }, { address: '0x123', chainId: 1 },
    { address: '0x' + '0'.repeat(40), chainId: 1 }, { address, chainId: '1' },
  ]) assert.throws(() => model.wallet(input));
});

test('location consent, coordinate bounds and precision are enforced', () => {
  assert.throws(() => model.location({ label: 'Here', precision: 'city', latitude: 0, longitude: 0 }), /consent/);
  for (const [latitude, longitude] of [[91, 0], [0, 181], [NaN, 0], [0, undefined]]) {
    assert.throws(() => model.location({ consent: true, label: 'Here', precision: 'precise', latitude, longitude }));
  }
  const place = { consent: true, label: 'Here', latitude: 12.3456789, longitude: -54.7654321 };
  assert.equal(model.location({ ...place, precision: 'precise' }).latitude, 12.345679);
  assert.equal(model.location({ ...place, precision: 'city' }).latitude, 12.3);
  assert.equal(model.location({ ...place, precision: 'country' }).latitude, 12);
  assert.equal(model.location({ consent: true, label: 'Country only', precision: 'country' }).latitude, undefined);
  assert.equal(model.location({ ...place, precision: 'space' }).latitude, undefined);
});

test('shared public wallets add disclosed graph links only for matching networks and addresses', () => {
  const input = fixture();
  const address = '0x' + '1'.repeat(40);
  input.entities[0].publicWallet = { address, chainId: 8453 };
  input.entities[1].publicWallet = { address, chainId: 8453 };
  input.entities[0].sharedLocation = { consent: true, precision: 'space', label: 'Orbit' };
  const bundle = model.validate(input, base.projects);
  const result = model.apply(base, bundle);
  const links = result.associations.filter(edge => edge.type === 'shared-public-wallet');
  assert.equal(links.length, 1);
  assert.match(links[0].sourceLabel, /ownership unverified/);
  assert.equal(result.projects.at(-1).sharedLocation.precision, 'space');
  const changed = model.apply(base, bundle, {}, {
    'local-creator:alice': { publicWallet: { address, chainId: 1 }, sharedLocation: null },
  });
  assert.equal(changed.associations.filter(edge => edge.type === 'shared-public-wallet').length, 0);
  assert.equal(changed.projects.at(-1).sharedLocation, null);
});

test('public balance lookup is read-only, block-specific and does not lose integer precision', async () => {
  const requests = [];
  const publicWallet = { address: '0x' + '1'.repeat(40), chainId: 8453 };
  const provider = { request: async request => {
    requests.push(request);
    return { eth_chainId: '0x2105', eth_blockNumber: '0x10', eth_getBalance: '0x1158e460913d00001' }[request.method];
  } };
  const balance = await model.readLedgerBalance(provider, publicWallet);
  assert.equal(balance.eth, '20.000000000000000001');
  assert.equal(balance.block, '16');
  assert.deepEqual(requests.map(request => request.method), ['eth_chainId', 'eth_blockNumber', 'eth_getBalance', 'eth_chainId']);
  assert.deepEqual(requests[2].params, [publicWallet.address, '0x10']);
});

test('wallet lookup surfaces wrong-chain, changed-chain, malformed and provider failures', async () => {
  const publicWallet = { address: '0x' + '1'.repeat(40), chainId: 8453 };
  await assert.rejects(model.readLedgerBalance(null, publicWallet), /provider/);
  await assert.rejects(model.readLedgerBalance({ request: async () => '0x1' }, publicWallet), /Select Base/);
  await assert.rejects(model.readLedgerBalance({ request: async () => '0x2105garbage' }, publicWallet), /malformed chain/);
  let calls = 0;
  await assert.rejects(model.readLedgerBalance({ request: async () =>
    ['0x2105', '0x10', '0x1', '0x1'][calls++] }, publicWallet), /network changed/);
  await assert.rejects(model.readLedgerBalance({ request: async request =>
    request.method === 'eth_chainId' ? '0x2105' : 'invalid' }, publicWallet), /malformed block/);
  await assert.rejects(model.readLedgerBalance({ request: async request =>
    ({ eth_chainId: '0x2105', eth_blockNumber: '0x1', eth_getBalance: '-1' })[request.method] }, publicWallet), /malformed balance/);
  await assert.rejects(model.readLedgerBalance({ request: async () => { throw new Error('Denied'); } }, publicWallet), /Denied/);
});
