const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const M = require('../scripts/supporter-dnft-model');
const snapshot = () => JSON.parse(fs.readFileSync(`${__dirname}/../data/supporter-dnfts.json`));
const wallet = '0x807061df657a7697c04045da7d16d941861caabc';

test('rolodex orders real release dates, not scan time or cross-chain token counters, and searches types', () => {
  const data = snapshot();
  const a = { ...data.tokens[0], id: 'a', tokenId: '900', properties: { release_date: '2026-01-01', category: 'Music' } };
  const b = { ...data.tokens[0], id: 'b', tokenId: '1', properties: { release_date: '2026-11-05', category: 'Tools' } };
  const c = { ...data.tokens[0], id: 'c', tokenId: '1000', properties: {} };
  assert.deepEqual(M.selectTokens([a, c, b]).map(t => t.id), ['b', 'a', 'c']);
  assert.deepEqual(M.selectTokens([a, b], 'music').map(t => t.id), ['a']);
  assert.deepEqual(M.selectTokens([a, b], 'tools optimism').map(t => t.id), ['b']);
  assert.equal(M.selectTokens([a, b], 'no such project').length, 0);
  const dated = { ...b, metadataUri: 'https://ipfs.io/ipfs/QmExact', properties: {} };
  const activity = { repositories: [{ release: { publishedAt: '2026-11-06', supporter: {
    chainId: dated.chainId, contract: dated.contract, tokenId: dated.tokenId, metadataURI: 'ipfs://QmExact',
  } } }] };
  assert.equal(M.releaseDate(dated, activity), Date.parse('2026-11-06'));
  assert.equal(M.releaseDate({ ...dated, metadataUri: 'ipfs://wrong' }, activity), 0);
});
test('series checkout binds the real 100-USDC price and withholds unsupported historical-chain offers', () => {
  const data = snapshot(), busking = data.tokens.find(t => t.chainId === 8453 && t.tokenId === '75');
  const listing = busking.listings[0];
  assert.ok(M.checkoutSupported(busking, listing));
  assert.equal(new URL(M.listingUrl(busking, listing)).searchParams.get('priceUSDC'), '100000000');
  for (const patch of [{ priceAmount: '1' }, { priceETH: '1' }, { active: false }, { available: '0' }]) {
    assert.equal(M.checkoutSupported(busking, { ...listing, ...patch }), false);
  }
  const legacy = data.tokens.find(t => t.chainId === 10);
  assert.equal(M.checkoutSupported(legacy, { ...listing }), false);
  assert.equal(new URL(M.listingUrl(legacy, listing)).pathname, '/DecentMarket/');
});

function reader({ failChain, wrongChain, malformed, failFirst = false } = {}) {
  const calls = [], providers = [];
  class FetchRequest { constructor(url) { this.url = url; } }
  class JsonRpcProvider {
    constructor(request) { this.url = request.url; this.chain = this.url.includes('optimism') ? 10 : 8453; providers.push(this); }
    async getNetwork() {
      if (this.chain === failChain || (failFirst && this.url === M.CHAINS[this.chain].rpcs[0])) throw new Error('RPC down');
      return { chainId: BigInt(this.chain === wrongChain ? 1 : this.chain) };
    }
    async getBlockNumber() { return 12345; }
    destroy() { this.destroyed = true; }
  }
  class Contract {
    constructor(contract, abi, provider) { this.provider = provider; this.contract = contract; }
    async balanceOfBatch(wallets, ids, opts) {
      calls.push({ wallets, ids, opts });
      if (malformed) return [];
      return ids.map(id => id === '79' ? 2n : 0n);
    }
  }
  return { ethers: { FetchRequest, JsonRpcProvider, Contract }, calls, providers };
}
test('holdings use ERC1155 balanceOfBatch at a pinned block, not escrow stock or creator ownership', async () => {
  const r = reader(), data = snapshot();
  const result = await M.readHoldings(data, wallet, r.ethers);
  assert.equal(result.errors.length, 0);
  assert.equal(result.holdings.length, 1);
  assert.equal(result.holdings[0].token.tokenId, '79');
  assert.equal(result.holdings[0].quantity, '2');
  assert.ok(r.calls.every(c => c.wallets.every(w => w === wallet) && c.opts.blockTag === 12345));
  assert.ok(r.providers.every(p => p.destroyed));
  assert.ok(r.calls.every(c => c.ids.length <= 64));
  await assert.rejects(M.readHoldings(data, 'not a wallet', r.ethers), /valid public wallet/);
});
test('failed or wrong-network reads stay unknown; partial successes remain visible; fallback works', async () => {
  for (const config of [{ failChain: 10 }, { wrongChain: 10 }]) {
    const r = reader(config), result = await M.readHoldings(snapshot(), wallet, r.ethers);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /not zero/);
    assert.equal(result.holdings[0].quantity, '2');
    assert.ok(r.providers.every(p => p.destroyed));
  }
  const bad = reader({ malformed: true });
  assert.equal((await M.readHoldings(snapshot(), wallet, bad.ethers)).errors.length, 2);
  const fallback = reader({ failFirst: true });
  assert.equal((await M.readHoldings(snapshot(), wallet, fallback.ethers)).errors.length, 0);
});
test('balance batching really splits 130 IDs into 64/64/2 without duplicate or missing reads', async () => {
  const data = snapshot(), template = data.tokens.find(t => t.chainId === 8453);
  data.tokens = Array.from({ length: 130 }, (_, i) => {
    const token = { ...template, tokenId: String(i) }; token.id = M.tokenKey(token); return token;
  });
  Object.assign(data, M.indexTokens(data.tokens));
  const r = reader();
  await M.readHoldings(data, wallet, r.ethers);
  assert.deepEqual(r.calls.map(c => c.ids.length), [64, 64, 2]);
  assert.deepEqual(r.calls.flatMap(c => c.ids), Array.from({ length: 130 }, (_, i) => String(i)));
});
test('Jolly-only mirror maps public Office task and milestone sources without altering signed profiles', () => {
  const window = { CanopySupporterModel: M };
  vm.runInNewContext(fs.readFileSync(`${__dirname}/../scripts/planning-office.js`, 'utf8'), { window, URL });
  const api = window.CanopyPlanningOffice, node = { kind: 'creator', creatorRecord: { wallet } };
  assert.ok(api.isJolly(node));
  assert.equal(api.isJolly({ ...node, creatorProjectKey: 'one', kind: 'project' }), false);
  assert.equal(api.isJolly({ kind: 'creator', creatorRecord: { wallet: `0x${'1'.repeat(40)}` } }), false);
  const agency = { projects: [{ name: 'Canopy', repo: 'TheJollyLaMa/DecentCanopy', currentState: 'Evidence', nextAction: 'Next', reviewedAt: '2026-11-05' }] };
  const progress = { schemaVersion: 2, checkedAt: '2026-11-05', repositories: [] };
  const board = { schemaVersion: 1, items: [{ title: 'Portfolio', fields: { Project: agency.projects[0].repo, Kind: 'Portfolio', Status: 'In Progress', Horizon: 'Now' } }] };
  const row = api.rows(agency, progress, board)[0];
  assert.equal(row.status, 'In Progress');
  assert.equal(row.horizon, 'Now');
  assert.equal(new URL(row.url).searchParams.get('site'), 'project:thejollylama/decentcanopy');
  assert.throws(() => api.rows(agency, {}, board), /unsupported shape/);
});
