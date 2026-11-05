const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../scripts/canopy-supporter-purchase');
const account = `0x${'1'.repeat(40)}`, hash = `0x${'a'.repeat(64)}`;
const listing = () => ({ nftContract: P.EDITION.nft, tokenId: 79n, priceETH: 0n,
  priceToken: P.EDITION.usdc, priceAmount: 10000000n, available: 1000n, active: true });
test('Canopy direct checkout rejects changed token, metadata, currency, price, empty stock and paused sales', () => {
  P.validateListing(listing(), 1000n, false, P.EDITION.metadataURI);
  for (const patch of [{ tokenId: 78n }, { nftContract: account }, { priceAmount: 100000000n }, { priceToken: account },
    { priceETH: 1n }, { active: false }, { available: 0n }]) {
    assert.throws(() => P.validateListing({ ...listing(), ...patch }, 1000n, false, P.EDITION.metadataURI));
  }
  assert.throws(() => P.validateListing(listing(), 0n, false, P.EDITION.metadataURI));
  assert.throws(() => P.validateListing(listing(), 1n, true, P.EDITION.metadataURI));
  assert.throws(() => P.validateListing(listing(), 1n, false, 'ipfs://wrong'));
});
function harness({ chain = 8453n, balance = 10000000n, allowance = 0n, approvalStatus = 1, changedAfterApproval = false,
  changedPriceAfterApproval = false, missingEvent = false, reject = false, purchaseStatus = 1 } = {}) {
  const calls = [], listeners = new Map(), providers = [];
  let approved = false;
  const raw = {
    on: (name, fn) => listeners.set(name, fn), removeListener: name => listeners.delete(name),
    async request({ method }) {
      calls.push(method);
      if (reject && method === 'eth_requestAccounts') throw Object.assign(new Error('Declined'), { code: 4001 });
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [changedAfterApproval && approved ? `0x${'2'.repeat(40)}` : account];
      if (method === 'eth_chainId') return `0x${chain.toString(16)}`;
      if (method === 'wallet_switchEthereumChain') { chain = 8453n; return; }
      throw new Error(method);
    },
  };
  class BrowserProvider {
    constructor() { providers.push(this); }
    async getNetwork() { return { chainId: chain }; }
    async getSigner() { return { getAddress: async () => account }; }
    destroy() { this.destroyed = true; }
  }
  class Contract {
    constructor(address) {
      this.address = address;
      this.interface = { parseLog: () => missingEvent ? null : { name: 'Purchased', args: {
        listingId: 9n, amount: 1n, buyer: account, paymentToken: P.EDITION.usdc, totalPaid: P.EDITION.price,
      } } };
      this.purchaseWithToken = async (id, quantity) => {
        calls.push(['purchase', id, quantity]); return { hash, wait: async () => ({ status: purchaseStatus, logs: [{ address: P.EDITION.escrow }] }) };
      };
      this.purchaseWithToken.estimateGas = async () => { calls.push('estimate'); };
    }
    connect() { return this; }
    async getListing() { calls.push('listing'); return { ...listing(), ...(changedPriceAfterApproval && approved ? { priceAmount: 1n } : {}) }; }
    async getNFTBalance() { return 1000n; }
    async paused() { return false; }
    async uri() { return P.EDITION.metadataURI; }
    async balanceOf() { return balance; }
    async allowance() { return allowance; }
    async approve(escrow, amount) {
      calls.push(['approval', escrow, amount]);
      return { hash, wait: async () => { approved = true; allowance = amount; return { status: approvalStatus }; } };
    }
  }
  return { raw, ethers: { BrowserProvider, Contract }, calls, listeners, providers };
}
test('buy-here approves exactly 10 USDC, rechecks, buys exactly one, and verifies its receipt', async () => {
  const h = harness({ chain: 1n }), transactions = [];
  const result = await P.purchase(h.raw, h.ethers, { transaction: (stage, hash) => transactions.push({ stage, hash }) });
  assert.equal(result.account, account);
  assert.deepEqual(h.calls.find(c => Array.isArray(c) && c[0] === 'approval'), ['approval', P.EDITION.escrow, 10000000n]);
  assert.deepEqual(h.calls.find(c => Array.isArray(c) && c[0] === 'purchase'), ['purchase', '9', 1n]);
  assert.ok(h.calls.filter(c => c === 'listing').length >= 2);
  assert.deepEqual(transactions.map(t => t.stage), ['approval', 'purchase']);
  assert.ok(h.providers.every(p => p.destroyed)); assert.equal(h.listeners.size, 0);
});
test('existing allowance skips approval; wallet, price and funding changes cannot submit a purchase', async () => {
  const approved = harness({ allowance: 10000000n });
  await P.purchase(approved.raw, approved.ethers);
  assert.equal(approved.calls.some(c => Array.isArray(c) && c[0] === 'approval'), false);
  for (const config of [{ balance: 0n }, { approvalStatus: 0 }, { changedAfterApproval: true }, { changedPriceAfterApproval: true }, { reject: true }]) {
    const h = harness(config);
    await assert.rejects(P.purchase(h.raw, h.ethers));
    assert.equal(h.calls.some(c => Array.isArray(c) && c[0] === 'purchase'), false);
    assert.ok(h.providers.every(p => p.destroyed)); assert.equal(h.listeners.size, 0);
  }
});
test('failed or mismatched purchase receipt cannot claim confirmed success', async () => {
  for (const config of [{ purchaseStatus: 0 }, { missingEvent: true }]) {
    const h = harness(config);
    await assert.rejects(P.purchase(h.raw, h.ethers), /confirm|event/);
  }
});
