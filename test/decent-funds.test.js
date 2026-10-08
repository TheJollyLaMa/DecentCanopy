'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { Wallet, verifyMessage, zeroPadValue, toBeHex } = require('../relay/node_modules/ethers');
const Records = require('../scripts/creator-records');
const Ledger = require('../scripts/ledger-proof');

const steward = new Wallet('0x' + '66'.repeat(32)), maker = new Wallet('0x' + '77'.repeat(32));
const S = steward.address.toLowerCase(), M = maker.address.toLowerCase();
const TX = '0x' + 'ab'.repeat(32), OTHER = '0x' + '12'.repeat(20);
const FUND_REF = `decent-fund:${S}:forest-fund`, PROJECT_REF = `decent-project:${M}:seeds`;

function base(wallet, overrides = {}) {
  return {
    format: 'decentcanopy-creator', version: 2, consent: true, wallet, revision: 1, previousCid: null,
    updatedAt: '2026-10-08T12:00:00.000Z', name: 'Someone', bio: '', website: '', avatar: '', location: null,
    projects: [], funds: [], funding: [], journey: [], ...overrides,
  };
}
const project = (key, extra = {}) => ({ key, name: key, description: '', website: '', image: '', status: 'active', archiveId: '', wallet: '', related: [], ...extra });
const fund = (extra = {}) => ({ key: 'forest-fund', name: 'Forest Fund', description: 'Grants for trees', website: '', image: '', status: 'open', treasury: { chain: 'base', address: steward.address }, supports: [PROJECT_REF], ...extra });
const funding = (extra = {}) => ({ key: 'grant', name: 'Forest Fund grant', projectKey: 'seeds', website: '', status: 'received', amount: 25, currency: 'USDC', asOf: '2026-10-08', note: '', fundRef: FUND_REF, chain: 'base', txHash: TX, ...extra });
const stewardRecord = (extra = {}) => Records.validate(base(steward.address, { name: 'Steward', funds: [fund()], ...extra }));
const makerRecord = (extra = {}) => Records.validate(base(maker.address, { name: 'Maker', projects: [project('seeds')], funding: [funding()], ...extra }));
const graph = entries => Records.apply({ projects: [], associations: [] }, entries.map(record => ({ record, cid: null })));
const claimEdge = (g, source, target) => g.associations.find(a => a.decentClaim && a.source === source && a.target === target);

test('version 2 records are signed canonically and version 1 records still verify', async () => {
  const record = stewardRecord(), message = Records.message(record);
  assert.deepEqual(Records.verify({ message, signature: await steward.signMessage(message) }, verifyMessage), record);
  assert.equal(record.funds[0].treasury.address, S);
  const v1 = Records.validate({ ...base(steward.address), version: 1, funds: undefined });
  assert.equal(v1.version, 1);
  assert.equal('funds' in v1, false);
  assert.equal(Records.parse(Records.message(v1)).version, 1);
});

test('funds, cross-references and ledger fields are validated', () => {
  assert.throws(() => stewardRecord({ funds: [fund({ supports: ['decent-fund:' + M + ':x'] })] }), /Decent projects/);
  assert.throws(() => stewardRecord({ funds: [fund({ supports: ['decent-project:not-a-wallet:x'] })] }), /Decent projects/);
  assert.throws(() => stewardRecord({ funds: [fund({ supports: [PROJECT_REF, PROJECT_REF] })] }), /duplicate/);
  assert.throws(() => stewardRecord({ funds: [fund({ supports: [`decent-project:${S}:missing`] })] }), /missing project/);
  assert.throws(() => stewardRecord({ funds: [fund({ treasury: { chain: 'base', address: '0x123' } })] }), /0x wallet/);
  assert.throws(() => stewardRecord({ funds: [fund({ treasury: { chain: 'solana', address: steward.address } })] }), /treasury chain/);
  assert.throws(() => stewardRecord({ funds: Array(11).fill(fund()) }), /10/);
  assert.throws(() => makerRecord({ projects: [project('seeds', { related: [PROJECT_REF] })] }), /itself/);
  assert.throws(() => makerRecord({ projects: [project('seeds', { wallet: '0x' + '0'.repeat(40) })] }), /non-zero/);
  assert.throws(() => makerRecord({ funding: [funding({ txHash: '0x1234' })] }), /64 hex/);
  assert.throws(() => makerRecord({ funding: [funding({ chain: '' })] }), /chain and the Decent fund/);
  assert.throws(() => makerRecord({ funding: [funding({ fundRef: '' })] }), /chain and the Decent fund/);
  assert.throws(() => makerRecord({ funding: [funding({ fundRef: `decent-fund:${M}:none` })] }), /missing fund/);
  assert.equal(stewardRecord({ funds: [fund({ treasury: null })] }).funds[0].treasury, null);
  assert.equal(makerRecord({ funding: [funding({ txHash: TX.toUpperCase().replace('0X', '0x') })] }).funding[0].txHash, TX);
});

test('Decent funds become blips and claims are marked one-sided or mutual', () => {
  const g = graph([stewardRecord(), makerRecord()]);
  const fundNode = g.projects.find(p => p.id === FUND_REF);
  assert.equal(fundNode.kind, 'fund');
  assert.equal(fundNode.creatorFundKey, 'forest-fund');
  assert.ok(g.associations.some(a => a.type === 'fund-steward' && a.source === `decent-creator:${S}` && a.target === FUND_REF));
  const edge = claimEdge(g, PROJECT_REF, FUND_REF);
  assert.equal(edge.decentClaim, 'mutual');
  assert.deepEqual(edge.claimedBy.sort(), [M, S].sort());
  assert.deepEqual(edge.ledgerCandidates, [{ chain: 'base', txHash: TX, treasury: S, recipient: M, treasurySigned: true, recipientSigned: true, fundingKey: 'grant' }]);
  assert.equal(g.projects.some(p => p.id.startsWith('decent-source:')), false, 'linked funding does not also create a private source blip');

  const oneSided = graph([stewardRecord(), makerRecord({ funding: [] })]);
  assert.equal(claimEdge(oneSided, PROJECT_REF, FUND_REF).decentClaim, 'claimed');
  const fundMissing = graph([makerRecord()]);
  assert.equal(fundMissing.associations.some(a => a.decentClaim), false, 'missing targets are ignored');
  assert.ok(fundMissing.projects.some(p => p.id === `decent-source:${M}:grant`), 'unresolved fund refs remain a private funding source');
});

test('related projects across wallets draw one stable edge, mutual only when both sides confirm', () => {
  const stewardProject = `decent-project:${S}:garden`;
  const steward1 = stewardRecord({ projects: [project('garden', { related: [PROJECT_REF] })], funds: [] });
  const maker1 = makerRecord({ funding: [] });
  const g = graph([steward1, maker1]);
  const rows = g.associations.filter(a => a.type === 'collaboration');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].decentClaim, 'claimed');
  const maker2 = makerRecord({ funding: [], projects: [project('seeds', { related: [stewardProject] })] });
  const mutual = graph([steward1, maker2]).associations.filter(a => a.type === 'collaboration');
  assert.equal(mutual.length, 1);
  assert.equal(mutual[0].decentClaim, 'mutual');
});

function provider({ tx = {}, receipt = {}, fail = false } = {}) {
  return {
    async getTransaction() { if (fail) throw new Error('down'); return { from: steward.address, to: '0x' + '99'.repeat(20), value: 0n, ...tx }; },
    async getTransactionReceipt() { if (fail) throw new Error('down'); return { status: 1, blockNumber: 10, logs: [], ...receipt }; },
  };
}
const transferLog = (from, to, amount = 25000000n) => ({
  address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  topics: [Ledger.TRANSFER_TOPIC, zeroPadValue(from, 32), zeroPadValue(to, 32)], data: toBeHex(amount, 32),
});

test('ERC-20 and native transfers from the signer treasury become ledger-verified edges', async () => {
  const g = graph([stewardRecord(), makerRecord()]);
  const calls = [];
  await Ledger.verifyGraph(g, { providerFor: chain => { calls.push(chain); return provider({ receipt: { logs: [transferLog(S, M)] } }); } });
  const edge = claimEdge(g, PROJECT_REF, FUND_REF);
  assert.deepEqual(calls, ['base']);
  assert.equal(edge.decentClaim, 'ledger');
  assert.deepEqual(edge.ledgerCandidates[0].proof.transfers, [{ asset: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', amount: '25000000' }]);
  assert.equal(edge.ledgerCandidates[0].proof.explorer, `https://basescan.org/tx/${TX}`);

  const native = graph([stewardRecord(), makerRecord()]);
  await Ledger.verifyGraph(native, { providerFor: () => provider({ tx: { from: steward.address, to: maker.address, value: 5n } }) });
  assert.equal(claimEdge(native, PROJECT_REF, FUND_REF).decentClaim, 'ledger');
});

test('ledger checks never upgrade failed, mismatched, declared-only or unreachable transfers', async () => {
  const cases = [
    [provider({ receipt: { status: 0, logs: [transferLog(S, M)] } }), /reverted/],
    [provider({ receipt: { logs: [transferLog(S, OTHER)] } }), /No transfer/],
    [provider({ receipt: { logs: [transferLog(OTHER, M)] } }), /No transfer/],
    [provider({ receipt: { logs: [transferLog(S, M, 0n)] } }), /No transfer/],
    [{ getTransaction: async () => null, getTransactionReceipt: async () => null }, /not found/],
    [provider({ fail: true }), /could not be reached/],
  ];
  for (const [p, reason] of cases) {
    const g = graph([stewardRecord(), makerRecord()]);
    await Ledger.verifyGraph(g, { providerFor: () => p });
    const edge = claimEdge(g, PROJECT_REF, FUND_REF);
    assert.equal(edge.decentClaim, 'mutual');
    assert.equal(edge.ledgerCandidates[0].proof.verified, false);
    assert.match(edge.ledgerCandidates[0].proof.reason, reason);
  }
  const declared = graph([stewardRecord({ funds: [fund({ treasury: { chain: 'base', address: OTHER } })] }), makerRecord()]);
  await Ledger.verifyGraph(declared, { providerFor: () => provider({ receipt: { logs: [transferLog(OTHER, M)] } }) });
  const edge = claimEdge(declared, PROJECT_REF, FUND_REF);
  assert.equal(edge.ledgerCandidates[0].proof.verified, true);
  assert.equal(edge.ledgerCandidates[0].treasurySigned, false);
  assert.equal(edge.decentClaim, 'mutual', 'a declared treasury is shown as found, not as ledger-verified');

  const wrongChain = graph([stewardRecord(), makerRecord({ funding: [funding({ chain: 'optimism' })] })]);
  assert.deepEqual(claimEdge(wrongChain, PROJECT_REF, FUND_REF).ledgerCandidates, [], 'transactions on a chain other than the treasury chain are not checked');
});

test('verified proofs are cached and checks are capped', async () => {
  const store = new Map(), cache = { get: id => store.get(id), set: (id, value) => store.set(id, value) };
  let calls = 0;
  const providerFor = () => { calls++; return provider({ receipt: { logs: [transferLog(S, M)] } }); };
  await Ledger.verifyGraph(graph([stewardRecord(), makerRecord()]), { providerFor, cache });
  const again = graph([stewardRecord(), makerRecord()]);
  await Ledger.verifyGraph(again, { providerFor, cache });
  assert.equal(calls, 1);
  assert.equal(claimEdge(again, PROJECT_REF, FUND_REF).decentClaim, 'ledger');
  const capped = graph([stewardRecord(), makerRecord()]);
  await Ledger.verifyGraph(capped, { providerFor, maxChecks: 0 });
  assert.equal(claimEdge(capped, PROJECT_REF, FUND_REF).ledgerCandidates[0].proof.unchecked, true);
  assert.equal(calls, 1);
});
