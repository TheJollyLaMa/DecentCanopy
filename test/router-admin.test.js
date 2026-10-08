'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ethers = require('../relay/node_modules/ethers');
const Admin = require('../scripts/router-admin');
const config = require('../payroll-assets.json');

function fixture(overrides = {}) {
  const calls = [];
  let allowance = overrides.allowance ?? 0n;
  const tx = label => ({
    hash: `0x${label === 'approve' ? 'a' : 'b'}`.padEnd(66, '0'),
    wait: async () => {
      calls.push(`${label}:wait`);
      if (label === 'approve') allowance = 10000000n;
      return { status: overrides.receiptStatus ?? 1 };
    },
  });
  function method(label) {
    const fn = async (...args) => { calls.push([label, ...args]); return tx(label); };
    fn.staticCall = async (...args) => {
      calls.push([`${label}:simulate`, ...args]);
      if (overrides.simulationError) throw new Error('simulation reverted');
      return overrides.approveResult ?? true;
    };
    return fn;
  }
  const context = {
    ethers,
    owner: '0x807061DF657A7697c04045dA7d16D941861cAABc',
    asset: config.assets.USDC.address,
    routerAddress: config.routerAddress,
    router: {
      funds: async () => ({ metadataUri: 'ipfs://example', active: overrides.active ?? true, exists: overrides.exists ?? true }),
      fundBalances: async () => 0n,
      approvedAssets: async () => overrides.approved ?? true,
      paused: async () => overrides.paused ?? false,
      hasRole: async role => { calls.push(['role', role]); return overrides.admin ?? true; },
      createFund: method('create'),
      fundToken: method('deposit'),
    },
    token: {
      decimals: async () => overrides.decimals ?? 6,
      balanceOf: async () => overrides.balance ?? 10000000n,
      allowance: async () => allowance,
      approve: method('approve'),
    },
    assertOwner: async () => {
      calls.push('owner');
      if (overrides.ownerError) throw new Error('wallet/network changed');
    },
    onTransaction: (hash, label, confirmed) => calls.push(['receipt', label, confirmed]),
  };
  return { context, calls };
}
const writes = calls => calls.filter(call => Array.isArray(call) && ['create', 'approve', 'deposit'].includes(call[0]));

test('allocation identifiers, public metadata and exact USDC amounts are validated', () => {
  assert.equal(Admin.allocationId('decentcanopy-repo-dev', ethers), ethers.id(config.fundSlug));
  for (const slug of ['', 'Repo', 'bad--slug', '-slug', '0x123 ', 'a'.repeat(81)]) {
    assert.throws(() => Admin.allocationId(slug, ethers), /slug/);
  }
  assert.equal(Admin.metadataUri(' ipfs://bafyexample/data.json '), 'ipfs://bafyexample/data.json');
  assert.equal(Admin.metadataUri('https://example.org/wiki'), 'https://example.org/wiki');
  for (const uri of ['', 'http://example.org', 'javascript:alert(1)', 'https://user:secret@example.org']) {
    assert.throws(() => Admin.metadataUri(uri), /URI/);
  }
  assert.equal(Admin.depositAmount('0.000001', ethers), 1n);
  assert.equal(Admin.depositAmount('10.123456', ethers), 10123456n);
  for (const amount of ['0', '-1', '1e6', '.5', '1.', '1.1234567', 'Infinity', '9'.repeat(80)]) {
    assert.throws(() => Admin.depositAmount(amount, ethers), /amount|range/);
  }
});

test('creation checks default admin, simulates and confirms a named fund without depositing', async () => {
  const { context, calls } = fixture({ exists: false });
  await Admin.createAllocation(context, config.fundSlug, 'https://example.org/fund');
  assert.deepEqual(writes(calls), [['create', ethers.id(config.fundSlug), 'https://example.org/fund']]);
  assert.deepEqual(calls.find(call => call[0] === 'role'), ['role', ethers.ZeroHash]);
  assert.ok(calls.some(call => call[0] === 'create:simulate'));
  assert.ok(calls.some(call => call[0] === 'receipt' && call[2] === true));
});

test('creation refuses missing role, existing fund and changed wallet without writes', async () => {
  for (const [options, error] of [
    [{ exists: false, admin: false }, /DEFAULT_ADMIN_ROLE/],
    [{ exists: true }, /already exists/],
    [{ exists: false, ownerError: true }, /changed/],
    [{ exists: false, simulationError: true }, /simulation reverted/],
  ]) {
    const { context, calls } = fixture(options);
    await assert.rejects(Admin.createAllocation(context, config.fundSlug, 'https://example.org'), error);
    assert.deepEqual(writes(calls), []);
  }
});

test('deposit approves the exact finite amount, waits, rechecks and funds the selected allocation', async () => {
  const { context, calls } = fixture();
  await Admin.deposit(context, 'decentcanopy-pinning', '10');
  assert.deepEqual(writes(calls), [
    ['approve', config.routerAddress, 10000000n],
    ['deposit', ethers.id('decentcanopy-pinning'), config.assets.USDC.address, 10000000n],
  ]);
  const approvalIndex = calls.indexOf('approve:wait');
  const depositIndex = calls.findIndex(call => call[0] === 'deposit');
  assert.ok(approvalIndex < depositIndex);
  assert.ok(calls.slice(approvalIndex + 1, depositIndex).includes('owner'));
  assert.ok(calls.some(call => call[0] === 'deposit:simulate'));
});

test('a sufficient allowance is reused without requesting a new approval', async () => {
  const { context, calls } = fixture({ allowance: 10000000n });
  await Admin.deposit(context, config.fundSlug, '1.25');
  assert.deepEqual(writes(calls), [['deposit', ethers.id(config.fundSlug), config.assets.USDC.address, 1250000n]]);
});

test('deposit rejects unavailable funds, unapproved assets, paused router and insufficient balance', async () => {
  for (const [options, error] of [
    [{ exists: false }, /exist and be active/], [{ active: false }, /exist and be active/],
    [{ approved: false }, /not approved/], [{ paused: true }, /paused/],
    [{ decimals: 18 }, /six decimals/], [{ balance: 1n }, /insufficient/],
    [{ ownerError: true }, /changed/], [{ approveResult: false }, /refused approval/],
    [{ simulationError: true }, /simulation reverted/],
  ]) {
    const { context, calls } = fixture(options);
    await assert.rejects(Admin.deposit(context, config.fundSlug, '10'), error);
    assert.deepEqual(writes(calls), []);
  }
});

test('a wallet switch after approval prevents deposit and does not report success', async () => {
  const { context, calls } = fixture();
  context.assertOwner = async () => {
    if (calls.includes('approve:wait')) throw new Error('wallet changed after approval');
  };
  await assert.rejects(Admin.deposit(context, config.fundSlug, '10'), /wallet changed/);
  assert.deepEqual(writes(calls).map(call => call[0]), ['approve']);
  assert.equal(calls.some(call => call[0] === 'receipt' && call[1] === 'USDC deposit'), false);
});

test('a fund paused after approval prevents deposit', async () => {
  const { context, calls } = fixture();
  context.router.paused = async () => calls.includes('approve:wait');
  await assert.rejects(Admin.deposit(context, config.fundSlug, '10'), /paused/);
  assert.deepEqual(writes(calls).map(call => call[0]), ['approve']);
});

test('failed approval receipts are explicit and stop before depositing', async () => {
  const { context, calls } = fixture({ receiptStatus: 0 });
  await assert.rejects(Admin.deposit(context, config.fundSlug, '10'), /did not confirm/);
  assert.deepEqual(writes(calls).map(call => call[0]), ['approve']);
  assert.equal(calls.some(call => call[0] === 'receipt' && call[2] === true), false);
});

test('wallet rejection and simulation failure do not become success-shaped results', async () => {
  const first = fixture();
  first.context.token.approve = Object.assign(async () => { throw new Error('user rejected'); }, { staticCall: async () => true });
  await assert.rejects(Admin.deposit(first.context, config.fundSlug, '10'), /user rejected/);
  assert.deepEqual(writes(first.calls), []);
  const second = fixture({ allowance: 10000000n, simulationError: true });
  await assert.rejects(Admin.deposit(second.context, config.fundSlug, '10'), /simulation reverted/);
  assert.deepEqual(writes(second.calls), []);
});

test('admin and About are sibling controls, and all wiki pages are linked to real local pages', () => {
  const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
  assert.match(html, /id="admin-tree-button"[\s\S]*?<\/button>\s*<button id="decent-head-about-button"/);
  assert.match(html, /scripts\/router-admin.js/);
  const payroll = fs.readFileSync(require.resolve('../scripts/payroll-admin.js'), 'utf8');
  assert.match(payroll, /function openPanel\(event\) \{\s*if \(!isOwnerWallet\(state.wallet\)\) return;/);
  assert.match(payroll, /treeButton\.classList\.toggle\('admin-ready', allowed\)/);
  for (const file of fs.readdirSync('wiki')) {
    const content = fs.readFileSync(`wiki/${file}`, 'utf8');
    for (const match of content.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
      if (/^https?:/.test(match[1])) continue;
      assert.ok(fs.existsSync(require('node:path').resolve('wiki', match[1])), `${file}: ${match[1]}`);
    }
  }
});
