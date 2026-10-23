'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Model = require('../scripts/public-source');
const Busking = require('../scripts/busking-public-source');
const UI = require('../scripts/public-source-ui');
const NOW = Date.parse('2026-10-23T15:00:00.000Z');
const AT = new Date(NOW).toISOString();
const HASH = '0x' + '1'.repeat(64);
const ADDRESS = '0x' + '2'.repeat(40);
const clone = value => JSON.parse(JSON.stringify(value));
function fixture() {
  const common = { schemaVersion: 1, chainId: 8453, routerAddress: Busking.ROUTER, ready: true, lastError: '', lastCheckedAt: AT };
  const payout = {
    slug: 'dbusk-repo-dev', fundId: Busking.FUNDS['dbusk-repo-dev'], asset: Busking.ASSET.address,
    recipient: ADDRESS, amountUnits: '9007199254740993000001', txHash: HASH, blockNumber: 100,
    timestamp: Math.floor(NOW / 1000) - 100, logIndex: 2
  };
  const funds = {};
  for (const [slug, fundId] of Object.entries(Busking.FUNDS)) {
    funds[slug] = { slug, label: slug, balanceUnits: '0', reservedUnits: '0', availableUnits: '0',
      sources: [{ slug, fundId, funder: ADDRESS, amountUnits: '1230000', txHash: HASH, blockNumber: 100,
        timestamp: Math.floor(NOW / 1000) - 100, logIndex: 1, kind: 'sponsor' }],
      payouts: slug === payout.slug ? [clone(payout)] : [] };
  }
  const responses = {
    funds: { ...common, funds, sponsorAliases: { PRIVATE: 'DO_NOT_COPY' } },
    'payroll/ledger': { ...common, scannedFrom: 90, scannedThrough: 110,
      entries: [{ ...payout, ...common, blockHash: HASH, verification: 'verified', paidAt: new Date(NOW - 100000).toISOString() }],
      snapshotUri: 'ipfs://bafkrei' + 'a'.repeat(52), backupPending: false,
      repositorySync: 'manual GitHub ledger workflow; PAYROLL_GITHUB_TOKEN not configured',
      payrollAnnouncements: { channelId: 'DO_NOT_COPY' } }
  };
  for (const slug of Object.keys(funds)) responses[`funds/${slug}/weeks`] = {
    fundSlug: slug, weeks: [], unmatchedPayouts: slug === 'dbusk-repo-dev' ? Array(11).fill({ private: 'DO_NOT_COPY' }) : [],
    unmatchedPaidUnits: slug === 'dbusk-repo-dev' ? payout.amountUnits : '0', now: NOW
  };
  return responses;
}
function evidenceFixture() {
  const values = fixture(), value = values.funds;
  Object.assign(value, { evidenceVersion: 1, source: 'worker-rpc', network: { chainId: 8453, name: 'Base' },
    asset: { address: Busking.ASSET.address, symbol: 'USDC', decimals: 6 } });
  for (const fund of Object.values(value.funds)) {
    Object.assign(fund, { asset: clone(value.asset), balanceAvailable: true, balanceCheckedAt: AT, balanceError: '',
      weeklyAvailable: true, weeklyCheckedAt: AT, weeklyError: '',
      sourcesAvailable: true, payoutsAvailable: true, historyCheckedAt: AT, historyError: '',
      payoutUnits: '0', advertUnits: '0', sponsorUnits: '1230000', djukeUnits: '0' });
    for (const deposit of fund.sources) deposit.asset = Busking.ASSET.address;
  }
  return values;
}
function fetcher(responses, calls = []) {
  return async (url, options) => {
    calls.push({ url, options });
    const value = responses[url.replace(Busking.BASE, '')];
    if (value instanceof Error) throw value;
    return { ok: true, headers: { get: () => null }, text: async () => JSON.stringify(value) };
  };
}
const snapshot = responses => Busking.createAdapter({ fetch: fetcher(responses), now: () => NOW }).getSnapshot();
function example(kind = 'project', extra = {}) {
  const defaults = {
    fund: { references: { project: 'garden:project:demo' } },
    contract: { network: { chainId: 1, address: ADDRESS } },
    interaction: { references: { project: 'garden:project:demo' }, attributes: { event: 'Pledge' } },
    relationship: { references: { from: 'garden:creator:demo', to: 'garden:project:demo' }, attributes: { relation: 'stewards' } }
  };
  return {
    schemaVersion: 1, id: `garden:${kind}:demo`, kind, label: `Community garden ${kind}`,
    source: { id: 'garden:source:public', url: 'https://example.org/public', observedAt: AT,
      verification: 'self-published', limitations: ['Steward-authored; not proof of legal identity or ownership.'] },
    coverage: { state: 'partial', fromBlock: null, throughBlock: null }, ...defaults[kind], ...extra
  };
}
test('provider-neutral examples validate every kind without Busking assumptions', () => {
  const records = [
    example('creator'), example('project'),
    example('fund', { asset: { chainId: 1, address: ADDRESS, symbol: 'TEST', decimals: 18 },
      amounts: { balance: '9007199254740993000001', reserved: null }, references: { project: 'garden:project:demo' } }),
    example('contract', { network: { chainId: 1, address: ADDRESS } }),
    example('interaction', { references: { fund: 'garden:fund:demo' }, attributes: { event: 'Pledge' },
      evidence: [{ url: 'https://example.org/evidence', label: 'Self-published pledge' }] }),
    example('relationship', { references: { from: 'garden:creator:demo', to: 'garden:project:demo' }, attributes: { relation: 'stewards' } })
  ];
  records.forEach(record => assert.equal(Model.validateRecord(record), record));
  for (const verification of Model.VERIFICATION) Model.validateRecord(example('creator', { source: { ...records[0].source, verification } }));
  Model.assertAdapter({ descriptor: { id: 'provider:garden', label: 'Garden', projectRefs: ['garden:project:demo'], capabilities: ['funds'] },
    getSnapshot: async () => ({}) });
});
test('schema rejects malformed IDs, addresses, versions, provenance and unknown fields', () => {
  for (const extra of [{ schemaVersion: 2 }, { id: '<script>' }, { kind: 'money-badge' }, { privateKey: 'never' },
    { network: { chainId: 8453, address: '0x123' } },
    { source: { ...example().source, verification: 'wallet-signature-proves-ownership' } },
    { source: { ...example().source, url: 'https://user:password@example.org' } },
    { coverage: { state: 'partial', fromBlock: 20, throughBlock: 10 } },
    { source: { ...example().source, observedAt: '2026-02-30T00:00:00Z' } }]) {
    assert.throws(() => Model.validateRecord(example('project', extra)));
  }
  assert.throws(() => Model.assertAdapter({ descriptor: Busking.descriptor }));
});
test('integer units remain exact and missing units stay unknown, never zero', () => {
  assert.equal(Model.formatUnits('9007199254740993000001', 6), '9007199254740993.000001');
  for (const value of [1, 0, -1, '', '01', '1.1', '-1', '1e6', (1n << 256n).toString()]) assert.throws(() => Model.units(value));
  assert.throws(() => Model.validateRecord(example('fund', { amounts: { balance: '10' } })));
  Model.validateRecord(example('fund', { amounts: { balance: null } }));
});
test('valid source data yields four ordinary funds and qualified exact router evidence', async () => {
  const data = await snapshot(fixture());
  assert.equal(data.state, 'partial');
  assert.equal(data.records.filter(record => record.kind === 'fund').length, 4);
  for (const fund of data.records.filter(record => record.kind === 'fund')) {
    assert.deepEqual(fund.amounts, { balance: null, reserved: null, available: null });
    assert.equal(fund.attributes.sponsorDeposits, '1');
  }
  const events = data.records.filter(record => record.kind === 'interaction');
  assert.equal(events.length, 1, 'same event in two endpoints is deduplicated');
  assert.equal(events[0].amounts.paid, '9007199254740993000001');
  assert.equal(events[0].source.verification, 'observed');
  assert.equal(events[0].attributes.sourceVerification, 'verified');
  assert.match(events[0].evidence[0].url, /^https:\/\/basescan\.org\/tx\/0x[0-9a-f]{64}#eventlog$/);
  assert.equal(data.sources[1].attributes.repositorySync, 'Manual repository sync; automatic sync not configured');
  assert.doesNotMatch(JSON.stringify(data), /DO_NOT_COPY|PRIVATE|PAYROLL_GITHUB_TOKEN|payrollAnnouncements/);
});
test('new evidence accepts nullable units and mixed balance outages without suppressing healthy events or enabling balances', async () => {
  const values = evidenceFixture();
  const fund = values.funds.funds['dbusk-playback'];
  Object.assign(fund, { balanceUnits: null, reservedUnits: null, availableUnits: null,
    balanceAvailable: false, balanceError: 'DO_NOT_COPY rpc diagnostic' });
  const data = await snapshot(values);
  assert.equal(data.sources[0].state, 'available');
  assert.equal(data.records.filter(record => record.kind === 'fund').length, 4);
  assert.equal(data.records.filter(record => record.kind === 'interaction').length, 1);
  for (const item of data.records.filter(record => record.kind === 'fund')) {
    assert.deepEqual(item.amounts, { balance: null, reserved: null, available: null },
      'even healthy real zero cannot activate monetary display');
    assert.equal(item.attributes.sponsorDeposits, '1');
  }
  assert.match(data.issues.join(' '), /dbusk-playback: balance unavailable/);
  assert.doesNotMatch(JSON.stringify(data), /DO_NOT_COPY/);
  const huge = '9007199254740993000001';
  values.funds.funds['dbusk-top10'].balanceUnits = huge;
  assert.equal((await snapshot(values)).records.find(record => record.id === 'busking:fund:dbusk-top10').amounts.balance, null);
  Object.assign(fund, { balanceUnits: '0', availableUnits: '0', balanceAvailable: true, balanceError: '' });
  const recovered = await snapshot(values);
  assert.equal(recovered.sources[0].state, 'available');
  assert.equal(recovered.records.filter(record => record.kind === 'interaction').length, 1);
  assert.equal(recovered.records.find(record => record.id === 'busking:fund:dbusk-playback').amounts.balance, null);
});
test('legacy nullable exact-unit fields are compatible without assuming new metadata', async () => {
  const values = fixture();
  for (const fund of Object.values(values.funds.funds)) {
    for (const key of ['balanceUnits', 'reservedUnits', 'availableUnits', 'payoutUnits', 'advertUnits', 'sponsorUnits', 'djukeUnits']) fund[key] = null;
  }
  const data = await snapshot(values);
  assert.equal(data.sources[0].state, 'available');
  assert.equal(data.records.filter(record => record.kind === 'fund').length, 4);
  assert.equal(data.records.find(record => record.kind === 'interaction').amounts.paid, '9007199254740993000001');
});
test('unavailable history hides retained payout claims and counts while independent healthy evidence survives', async () => {
  const values = evidenceFixture();
  const fund = values.funds.funds['dbusk-repo-dev'];
  Object.assign(fund, { sourcesAvailable: false, payoutsAvailable: false,
    historyError: 'DO_NOT_COPY private RPC', payoutUnits: null, advertUnits: null, sponsorUnits: null, djukeUnits: null });
  values['payroll/ledger'] = new Error('No independent ledger');
  let data = await snapshot(values);
  assert.equal(data.sources[0].state, 'available');
  assert.equal(data.records.filter(record => record.kind === 'fund').length, 4);
  assert.equal(data.records.filter(record => record.kind === 'interaction').length, 0);
  assert.equal(data.records.find(record => record.id === 'busking:fund:dbusk-repo-dev').attributes.sponsorDeposits, 'Unavailable');
  assert.doesNotMatch(JSON.stringify(data), /DO_NOT_COPY/);
  assert.equal(data.records.find(record => record.id === 'busking:fund:dbusk-top10').attributes.sponsorDeposits, '1');
  const healthy = values.funds.funds['dbusk-top10'];
  healthy.payouts = [{ ...clone(fixture().funds.funds['dbusk-repo-dev'].payouts[0]),
    slug: healthy.slug, fundId: Busking.FUNDS[healthy.slug], txHash: '0x' + '3'.repeat(64) }];
  data = await snapshot(values);
  assert.equal(data.records.filter(record => record.kind === 'interaction').length, 1, 'another healthy fund payout survives in the same response');
  values['payroll/ledger'] = fixture()['payroll/ledger'];
  data = await snapshot(values);
  assert.equal(data.records.filter(record => record.kind === 'interaction').length, 2, 'separate payroll endpoint survives fund history outage');
});
test('stale per-fund history stays stale and null uninitialized observations do not invent zero history', async () => {
  let values = evidenceFixture();
  values.funds.funds['dbusk-repo-dev'].historyCheckedAt = new Date(NOW - 16 * 60000).toISOString();
  values.funds.funds['dbusk-repo-dev'].sources[0].timestamp = Math.floor(NOW / 1000) - 17 * 60;
  values.funds.funds['dbusk-repo-dev'].payouts = [];
  let data = await snapshot(values);
  assert.equal(data.records.find(record => record.id === 'busking:fund:dbusk-repo-dev').coverage.state, 'stale');
  values = evidenceFixture();
  values.funds.lastCheckedAt = null;
  values.funds.ready = false;
  for (const fund of Object.values(values.funds.funds)) {
    Object.assign(fund, { sources: [], payouts: [], sourcesAvailable: false, payoutsAvailable: false,
      historyCheckedAt: null, historyError: '', advertUnits: null, sponsorUnits: null, djukeUnits: null, payoutUnits: null });
  }
  data = await snapshot(values);
  assert.equal(data.sources[0].state, 'partial');
  assert.equal(data.sources[0].observedAt, null);
  assert.equal(data.records.filter(record => record.kind === 'fund').length, 0);
  assert.equal(data.records.filter(record => record.kind === 'interaction').length, 1);
  assert.match(data.issues.join(' '), /history uninitialized/);
  values['payroll/ledger'].ready = false;
  values['payroll/ledger'].lastCheckedAt = null;
  data = await snapshot(values);
  assert.equal(data.sources[1].state, 'partial');
  assert.equal(data.records.filter(record => record.kind === 'interaction').length, 0);
});
test('evidence identity and source availability metadata fail closed when foreign, malformed or inconsistent', async () => {
  const changes = [
    value => { value.evidenceVersion = 2; }, value => { value.evidenceVersion = null; },
    value => { value.network.chainId = 10; }, value => { value.network.name = 'Optimism'; },
    value => { value.asset.address = ADDRESS; }, value => { value.asset.symbol = 'ETH'; },
    value => { value.asset.decimals = 18; }, value => { value.source = 'independently-verified'; },
    value => { delete value.network; }, value => { delete value.asset; },
    value => { value.funds['dbusk-playback'].asset.decimals = 18; },
    value => { value.funds['dbusk-playback'].sources[0].asset = ADDRESS; },
    value => { delete value.funds['dbusk-playback'].sources[0].asset; },
    value => { value.funds['dbusk-playback'].balanceAvailable = 'false'; },
    value => { value.funds['dbusk-playback'].balanceAvailable = false; },
    value => { value.funds['dbusk-playback'].balanceUnits = null; },
    value => { value.funds['dbusk-playback'].historyCheckedAt = null; },
    value => { value.funds['dbusk-playback'].historyCheckedAt = new Date(NOW + 120000).toISOString(); },
    value => { value.funds['dbusk-playback'].weeklyCheckedAt = '2026-02-30T00:00:00Z'; },
    value => { value.funds['dbusk-playback'].balanceError = {}; },
    value => { value.funds['dbusk-playback'].historyError = 'unavailable'; },
    value => { delete value.funds['dbusk-playback'].historyCheckedAt; },
    value => { value.funds['dbusk-playback'].payoutUnits = 0; }
  ];
  for (const change of changes) {
    const values = evidenceFixture(); change(values.funds);
    const data = await snapshot(values);
    assert.equal(data.sources[0].state, 'unavailable', change.toString());
    assert.equal(data.records.filter(record => record.kind === 'fund').length, 0);
    assert.equal(data.records.filter(record => record.kind === 'interaction').length, 1);
  }
});
test('stale, not-ready and source errors never become healthy or leak diagnostics', async () => {
  const values = fixture();
  values.funds.lastCheckedAt = new Date(NOW - 16 * 60000).toISOString();
  values.funds.funds['dbusk-repo-dev'].payouts = [];
  for (const fund of Object.values(values.funds.funds)) fund.sources = [];
  values['payroll/ledger'].ready = false;
  values['payroll/ledger'].lastError = 'https://user:secret@private.invalid?key=PRIVATE';
  const data = await snapshot(values);
  assert.equal(data.sources[0].state, 'stale');
  assert.equal(data.sources[1].state, 'partial');
  assert.match(data.sources[1].lastError, /raw diagnostics withheld/);
  assert.doesNotMatch(JSON.stringify(data), /secret|private.invalid/);
  assert.match(UI.render(data, NOW + 17 * 60000), /stale source data/);
});
test('unmatched weekly payouts stay unresolved even when weeks are empty', async () => {
  const data = await snapshot(fixture());
  const weekly = data.sources.find(source => source.id === 'busking:source:weeks:dbusk-repo-dev');
  assert.equal(weekly.state, 'partial');
  assert.equal(weekly.attributes.weeks, '0');
  assert.equal(weekly.attributes.unmatchedPayouts, '11');
  assert.match(weekly.attributes.reconciliation, /unresolved/);
  assert.match(weekly.attributes.version, /Unversioned/);
  assert.doesNotMatch(JSON.stringify(weekly), /unmatchedPaidUnits|paidUnits/);
  const empty = data.sources.find(source => source.id.endsWith('weeks:dbusk-pinners'));
  assert.match(empty.attributes.reconciliation, /Empty weeks never mean zero payouts/);
});
test('unversioned weekly shape changes and malformed identities fail without losing other sources', async () => {
  for (const change of [
    value => { value.fundSlug = 'wrong-fund'; },
    value => { value.schemaVersion = 2; },
    value => { value.unmatchedPaidUnits = 0; },
    value => { value.now = NOW + 120000; },
    value => { delete value.unmatchedPayouts; }
  ]) {
    const values = fixture();
    change(values['funds/dbusk-repo-dev/weeks']);
    const data = await snapshot(values);
    assert.equal(data.sources.find(source => source.id === 'busking:source:weeks:dbusk-repo-dev').state, 'unavailable');
    assert.equal(data.records.filter(record => record.kind === 'fund').length, 4);
    assert.match(data.issues.join(' '), /Weekly reconciliation unresolved/);
  }
});
test('scan coverage is explicit, including restored events outside declared coverage', async () => {
  const values = fixture();
  values['payroll/ledger'].scannedFrom = 105;
  let data = await snapshot(values);
  assert.equal(data.sources[1].attributes.outsideScanEntries, '1');
  assert.equal(data.records.find(record => record.kind === 'interaction').coverage.fromBlock, null);
  assert.match(data.records.find(record => record.kind === 'interaction').source.limitations.join(' '), /outside its declared scan/);
  values['payroll/ledger'].scannedFrom = null;
  values['payroll/ledger'].scannedThrough = null;
  data = await snapshot(values);
  assert.equal(data.sources[1].state, 'available');
  assert.equal(data.sources[1].coverage.state, 'partial');
  values['payroll/ledger'].scannedFrom = 200;
  values['payroll/ledger'].scannedThrough = 100;
  data = await snapshot(values);
  assert.equal(data.sources[1].state, 'unavailable');
  assert.match(data.sources[1].lastError, /Reversed coverage/);
});
test('changed versions, wrong deployment, fund, asset, integer or timestamps fail closed per endpoint', async () => {
  const changes = [
    values => { values.funds.schemaVersion = 2; },
    values => { values.funds.chainId = 10; },
    values => { values.funds.routerAddress = ADDRESS; },
    values => { values.funds.funds['dbusk-repo-dev'].slug = 'wrong'; },
    values => { values.funds.funds['dbusk-repo-dev'].payouts[0].asset = ADDRESS; },
    values => { values.funds.funds['dbusk-repo-dev'].payouts[0].fundId = HASH; },
    values => { values.funds.funds['dbusk-repo-dev'].balanceUnits = 0; },
    values => { values.funds.lastCheckedAt = new Date(NOW + 120000).toISOString(); },
    values => { values.funds.funds['dbusk-repo-dev'].payouts.push(clone(values.funds.funds['dbusk-repo-dev'].payouts[0])); },
    values => { values.funds.funds['dbusk-repo-dev'].sources.push(clone(values.funds.funds['dbusk-repo-dev'].sources[0])); }
  ];
  for (const change of changes) {
    const values = fixture(); change(values);
    const data = await snapshot(values);
    assert.equal(data.sources[0].state, 'unavailable');
    assert.equal(data.records.filter(record => record.kind === 'fund').length, 0);
    assert.equal(data.records.filter(record => record.kind === 'interaction').length, 1, 'other independent endpoint survives');
    assert.equal(new Set(data.sources.map(source => source.id)).size, data.sources.length);
  }
});
test('partial fund collection does not invent missing funds or history', async () => {
  const values = fixture();
  delete values.funds.funds['dbusk-pinners'];
  delete values.funds.funds['dbusk-playback'].payouts;
  const data = await snapshot(values);
  assert.equal(data.records.filter(record => record.kind === 'fund').length, 3);
  assert.match(data.issues.join(' '), /dbusk-pinners: fund unavailable/);
  assert.match(data.issues.join(' '), /dbusk-playback: payout history unavailable/);
});
test('conflicting payout claims are suppressed, not promoted to verified', async () => {
  const values = fixture();
  values['payroll/ledger'].entries[0].amountUnits = '1';
  const data = await snapshot(values);
  assert.equal(data.records.filter(record => record.kind === 'interaction').length, 0);
  assert.match(data.issues.join(' '), /Conflicting payout claims/);
});
test('unknown upstream fields are discarded, normalized unknown fields rejected', async () => {
  const values = fixture();
  values.funds.privateCredentials = { secret: 'DO_NOT_COPY' };
  values.funds.funds['dbusk-playback'].unpublishedBooking = 'DO_NOT_COPY';
  const data = await snapshot(values);
  assert.doesNotMatch(JSON.stringify(data), /DO_NOT_COPY/);
  assert.throws(() => Model.validateSnapshot({ ...data, newPolicy: true }));
});
test('unavailable is distinct from an explicitly empty observed snapshot', async () => {
  const values = fixture();
  Object.keys(values).forEach(key => { values[key] = new Error('private internal URL DO_NOT_COPY'); });
  const data = await snapshot(values);
  assert.equal(data.state, 'unavailable');
  assert.deepEqual(data.records, []);
  assert.equal(data.sources.filter(source => source.state === 'unavailable').length, 6);
  assert.doesNotMatch(JSON.stringify(data), /DO_NOT_COPY/);
  assert.match(UI.render(data), /Unknown amounts are not zero/);
  const empty = { ...data, state: 'available', sources: [], issues: [] };
  assert.equal(Model.validateSnapshot(empty).records.length, 0);
});
test('read-only no-store requests omit credentials and refetch after failure', async () => {
  const values = fixture(), calls = [];
  const adapter = Busking.createAdapter({ fetch: fetcher(values, calls), now: () => NOW });
  values.funds = new Error('failed');
  assert.equal((await adapter.getSnapshot()).sources[0].state, 'unavailable');
  values.funds = fixture().funds;
  assert.equal((await adapter.getSnapshot()).sources[0].state, 'available');
  assert.equal(calls.length, 12);
  for (const call of calls) {
    assert.equal(call.options.method, 'GET');
    assert.equal(call.options.credentials, 'omit');
    assert.equal(call.options.cache, 'no-store');
    assert.equal(call.options.redirect, 'error');
    assert.equal(call.options.body, undefined);
  }
});
test('fetch bounds HTTP errors, rate limits, malformed JSON, oversize and hung workers', async () => {
  await assert.rejects(Model.fetchJSON('https://example.org', { fetch: async () => ({ ok: false, status: 429 }) }), /HTTP 429/);
  await assert.rejects(Model.fetchJSON('https://example.org', { fetch: async () => ({ ok: true, headers: { get: () => '2000000' } }) }), /too large/);
  await assert.rejects(Model.fetchJSON('https://example.org', { maxBytes: 2, fetch: async () => ({ ok: true, text: async () => 'abc' }) }), /too large/);
  await assert.rejects(Model.fetchJSON('https://example.org', { fetch: async () => ({ ok: true, text: async () => '{invalid' }) }), SyntaxError);
  await assert.rejects(Model.fetchJSON('https://example.org', { timeoutMs: 5, fetch: async () => new Promise(() => {}) }), /timeout/);
  let cancelled = false, sent = false;
  await assert.rejects(Model.fetchJSON('https://example.org', { maxBytes: 2, fetch: async () => ({
    ok: true, body: { getReader: () => ({ read: async () => sent ? { done: true } : (sent = true, { done: false, value: new Uint8Array(3) }),
      cancel: async () => { cancelled = true; } }) }
  }) }), /too large/);
  assert.equal(cancelled, true);
});
test('generic UI escapes source text, bounds evidence and never uses a verification badge', async () => {
  const data = await snapshot(fixture());
  data.records.find(record => record.kind === 'fund').label = '<img src=x onerror=alert(1)>';
  const html = UI.render(data, NOW);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img|verification-badge|independently verified payout|reconciled totals/i);
  assert.match(html, /Source verification claim: verified/);
  assert.match(html, /not independently verified by Canopy/);
  assert.match(html, /Balance: Unavailable/);
  const payout = data.records.find(record => record.kind === 'interaction');
  for (let i = 0; i < 30; i++) data.records.push({ ...clone(payout), id: `busking:payout:extra${i}` });
  assert.match(UI.render(data, NOW), /first 25 records only/);
});
test('browser script wiring packages provider-neutral plumbing and mounts once outside frame loops', () => {
  const read = file => fs.readFileSync(require.resolve('../' + file), 'utf8');
  const html = read('index.html'), spiral = read('scripts/spiral.js');
  const files = require('../scripts/siteFiles').listSiteFiles();
  for (const file of ['public-source.js', 'busking-public-source.js', 'public-source-ui.js']) {
    assert.ok(html.includes(`scripts/${file}`));
    assert.ok(files.includes(`scripts/${file}`));
  }
  assert.equal((spiral.match(/CanopyPublicSourceUI\?\.mount/g) || []).length, 1);
  const sandbox = { globalThis: null };
  sandbox.globalThis = sandbox;
  for (const file of ['public-source.js', 'busking-public-source.js', 'public-source-ui.js']) vm.runInNewContext(read('scripts/' + file), sandbox);
  assert.equal(typeof sandbox.CanopyPublicSourceUI.mount, 'function');
  assert.equal(Busking.descriptor.projectRefs.includes('agency-project:decent-busking'), true);
});
test('sidepanel is lazy, refreshable, safe across navigation and preserves disclosures', async () => {
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; this.listeners = {}; this.isConnected = true; this.open = false; this.innerHTML = ''; }
    append(child) { this.children.push(child); child.parent = this; }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(key, fn) { this.listeners[key] = fn; }
    querySelector() { return this.children.find(child => Object.hasOwn(child.attributes, 'data-public-sources')); }
    querySelectorAll() { return []; }
    remove() { this.isConnected = false; this.parent.children = this.parent.children.filter(child => child !== this); }
  }
  const data = await snapshot(fixture()), timers = new Map();
  let calls = 0, resolve, nextTimer = 0;
  const adapter = { descriptor: { ...Busking.descriptor, projectRefs: ['garden:project:demo'] },
    getSnapshot: () => { calls++; return new Promise(done => { resolve = done; }); } };
  const sandbox = {
    CanopyPublicSource: Model, CanopyBuskingPublicSource: { createAdapter: () => adapter },
    document: { createElement: tag => new Element(tag) },
    setTimeout: fn => { timers.set(++nextTimer, fn); return nextTimer; }, clearTimeout: id => timers.delete(id)
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../scripts/public-source-ui'), 'utf8'), sandbox);
  const ui = sandbox.CanopyPublicSourceUI, container = new Element('div');
  ui.mount(container, { id: 'unrelated:project' });
  assert.equal(container.children.length, 0);
  ui.mount(container, { id: 'garden:project:demo', creatorDraft: true });
  assert.equal(container.children.length, 0);
  ui.mount(container, { id: 'garden:project:demo' });
  assert.equal(calls, 0, 'closed disclosure performs no fetch');
  const first = container.children[0];
  first.open = true; first.listeners.toggle();
  assert.equal(calls, 1);
  first.listeners.toggle();
  assert.equal(calls, 1, 'no duplicate in-flight requests');
  ui.mount(container, { id: 'unrelated:project' });
  resolve(data);
  await new Promise(setImmediate);
  assert.equal(first.children[1].innerHTML, '', 'late response does not write to detached panel');
  assert.equal(timers.size, 0);
  ui.mount(container, { id: 'garden:project:demo' });
  const active = container.children[0];
  active.open = true; active.listeners.toggle();
  resolve(data);
  await new Promise(setImmediate);
  assert.equal(active.open, true, 'loading does not collapse the editor or outer disclosure');
  assert.match(active.children[1].innerHTML, /Public source status: partial/);
  assert.equal(timers.size, 1);
  active.open = false; active.listeners.toggle();
  assert.equal(timers.size, 0, 'closed panel stops age refreshes');
  active.open = true; active.listeners.toggle();
  assert.equal(calls, 2, 'reopening does not secretly refetch financial data');
  active.listeners.click({ target: { closest: () => true }, preventDefault() {} });
  assert.equal(calls, 3, 'explicit refresh fetches again');
  resolve({ ...data, providerId: 'provider:wrong' });
  await new Promise(setImmediate);
  assert.match(active.children[1].innerHTML, /Public source unavailable/);
  active.open = false; active.listeners.toggle();
  active.open = true; active.listeners.toggle();
  assert.equal(calls, 4, 'failed refresh cannot restore a cached success on reopen');
  resolve(data);
  await new Promise(setImmediate);
  active.open = false; active.listeners.toggle();
});
