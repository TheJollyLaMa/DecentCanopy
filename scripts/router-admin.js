(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.DecentCanopyRouterAdmin = api;
    api.init(root);
  }
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';

  const ROUTER_ABI = [
    'function hasRole(bytes32 role, address account) view returns (bool)',
    'function funds(bytes32 fundId) view returns (string metadataUri, bool active, bool exists)',
    'function fundBalances(bytes32 fundId, address asset) view returns (uint256)',
    'function approvedAssets(address asset) view returns (bool)',
    'function paused() view returns (bool)',
    'function createFund(bytes32 fundId, string metadataUri)',
    'function fundToken(bytes32 fundId, address asset, uint256 amount)',
  ];
  const TOKEN_ABI = [
    'function balanceOf(address wallet) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function approve(address spender, uint256 amount) returns (bool)',
  ];

  function allocationId(slug, ethers) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) {
      throw new Error('Use a lowercase allocation slug with letters, numbers and single hyphens (maximum 80 characters).');
    }
    return ethers.id(slug);
  }

  function metadataUri(value) {
    const text = String(value).trim();
    let url;
    try { url = new URL(text); } catch (_) { throw new Error('Provide a valid HTTPS or IPFS metadata URI.'); }
    if (text.length > 2048 || !['https:', 'ipfs:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
      throw new Error('Metadata must be a public HTTPS or IPFS URI without embedded credentials.');
    }
    return text;
  }

  function depositAmount(value, ethers) {
    if (!/^\d+(?:\.\d{1,6})?$/.test(value)) throw new Error('Use a positive USDC amount with at most six decimal places.');
    const amount = ethers.parseUnits(value, 6);
    if (amount <= 0n || amount > ethers.MaxUint256) throw new Error('The USDC amount is outside the valid range.');
    return amount;
  }

  async function inspect(router, id, asset) {
    const fund = await router.funds(id);
    const exists = Boolean(fund.exists ?? fund[2]);
    const [balance, approved, paused] = await Promise.all([
      exists ? router.fundBalances(id, asset) : 0n,
      router.approvedAssets(asset),
      router.paused(),
    ]);
    return { exists, active: Boolean(fund.active ?? fund[1]), metadata: String(fund.metadataUri ?? fund[0]), balance, approved, paused };
  }

  async function confirmed(transaction, label, context) {
    context.onTransaction(transaction.hash, label, false);
    const receipt = await transaction.wait();
    if (!receipt || receipt.status !== 1) throw new Error(`${label} did not confirm successfully. Inspect its transaction before retrying.`);
    context.onTransaction(receipt.hash || transaction.hash, label, true);
    return receipt;
  }

  async function createAllocation(context, slug, uri) {
    const { ethers, router } = context;
    const id = allocationId(slug, ethers);
    const metadata = metadataUri(uri);
    await context.assertOwner();
    if (!(await router.hasRole(ethers.ZeroHash, context.owner))) {
      throw new Error('The admin wallet lacks DEFAULT_ADMIN_ROLE on this router.');
    }
    if ((await inspect(router, id, context.asset)).exists) throw new Error('This allocation already exists. No transaction was sent.');
    await router.createFund.staticCall(id, metadata);
    await context.assertOwner();
    return confirmed(await router.createFund(id, metadata), 'Create allocation', context);
  }

  async function deposit(context, slug, value) {
    const { ethers, router, token } = context;
    const id = allocationId(slug, ethers);
    const amount = depositAmount(value, ethers);
    async function check() {
      await context.assertOwner();
      const fund = await inspect(router, id, context.asset);
      if (!fund.exists || !fund.active) throw new Error('The allocation must exist and be active before depositing.');
      if (!fund.approved) throw new Error('USDC is not approved on the router.');
      if (fund.paused) throw new Error('The router is paused. Deposits are unavailable.');
      if (Number(await token.decimals()) !== 6) throw new Error('The configured USDC token does not have six decimals.');
      if (await token.balanceOf(context.owner) < amount) throw new Error('The admin wallet has insufficient USDC.');
    }
    await check();
    if (await token.allowance(context.owner, context.routerAddress) < amount) {
      if (!(await token.approve.staticCall(context.routerAddress, amount))) throw new Error('The token refused approval.');
      await context.assertOwner();
      await confirmed(await token.approve(context.routerAddress, amount), 'USDC approval', context);
    }
    await check();
    await router.fundToken.staticCall(id, context.asset, amount);
    await context.assertOwner();
    return confirmed(await router.fundToken(id, context.asset, amount), 'USDC deposit', context);
  }

  function init(window) {
    const document = window.document;
    const byId = id => document.getElementById(id);
    let config;
    let owner;
    let selectedSlug = null;
    let selectedFund = null;
    let busy = false;
    let payrollBusy = false;
    let generation = 0;
    const transactionLinks = new Map();
    function status(text, error = false) {
      const el = byId('admin-router-status');
      el.textContent = text;
      el.dataset.kind = error ? 'error' : '';
    }
    function enabled() {
      const wallet = window.decentCanopyWallet;
      return Boolean(owner && wallet?.address?.toLowerCase() === owner.toLowerCase() && wallet.chainId === 8453);
    }
    function updateControls() {
      const locked = busy || payrollBusy || !enabled();
      byId('admin-create-button').disabled = locked || !selectedFund || selectedFund.exists;
      byId('admin-deposit-button').disabled = locked || !selectedFund?.exists || !selectedFund.active || !selectedFund.approved || selectedFund.paused;
      byId('admin-fund-form').querySelector('button').disabled = busy || payrollBusy;
      byId('admin-fund-slug').disabled = busy;
      byId('admin-fund-metadata').disabled = busy;
      byId('admin-deposit-amount').disabled = busy;
    }
    async function load() {
      const read = async path => {
        const response = await window.fetch(`${path}?t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Could not load ${path} (${response.status}).`);
        return response.json();
      };
      const [settings, accounts] = await Promise.all([read('payroll-assets.json'), read('contributor-accounts.json')]);
      const registered = accounts.contributors?.find(row => row.role === 'owner')?.walletAddress;
      if (!window.ethers?.isAddress(registered) || settings.chainId !== 8453 ||
        !window.ethers.isAddress(settings.routerAddress) ||
        settings.assets?.USDC?.address?.toLowerCase() !== '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' ||
        settings.assets.USDC.decimals !== 6) {
        throw new Error('Admin registry or Base USDC/router configuration is invalid.');
      }
      config = settings;
      owner = registered;
      if (!byId('admin-fund-slug').value) byId('admin-fund-slug').value = config.fundSlug;
    }
    function reader() {
      return new window.ethers.Contract(config.routerAddress, ROUTER_ABI,
        new window.ethers.JsonRpcProvider(config.rpcUrl, 8453, { batchMaxCount: 1 }));
    }
    async function lookup() {
      const current = ++generation;
      selectedSlug = null;
      selectedFund = null;
      updateControls();
      await load();
      const slug = byId('admin-fund-slug').value.trim();
      const id = allocationId(slug, window.ethers);
      const fund = await inspect(reader(), id, config.assets.USDC.address);
      if (current !== generation) return;
      selectedSlug = slug;
      selectedFund = fund;
      byId('admin-fund-info').textContent =
        `${slug} · ${fund.exists ? fund.active ? 'active' : 'inactive' : 'not created'} · ${window.ethers.formatUnits(fund.balance, 6)} USDC\n` +
        `ID: ${id}\nMetadata: ${fund.metadata || 'none'}\nUSDC ${fund.approved ? 'approved' : 'not approved'} · Router ${fund.paused ? 'paused' : 'unpaused'}`;
      status(enabled() ? 'Allocation inspected. Review the slug and amount before confirming a transaction.' : 'Connect the registered admin wallet on Base to transact.');
      updateControls();
    }
    async function context() {
      if (!enabled() || !window.ethereum) throw new Error('Connect the registered admin wallet on Base.');
      const ethers = window.ethers;
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const expectedOwner = owner;
      const assertOwner = async () => {
        const [accounts, chain] = await Promise.all([
          window.ethereum.request({ method: 'eth_accounts' }),
          window.ethereum.request({ method: 'eth_chainId' }),
        ]);
        if (Number.parseInt(chain, 16) !== 8453 || accounts[0]?.toLowerCase() !== expectedOwner.toLowerCase() ||
          (await signer.getAddress()).toLowerCase() !== expectedOwner.toLowerCase()) {
          throw new Error('The wallet or network changed. Reconnect the registered admin on Base.');
        }
      };
      await assertOwner();
      return {
        ethers, owner: expectedOwner, asset: config.assets.USDC.address, routerAddress: config.routerAddress, assertOwner,
        router: new ethers.Contract(config.routerAddress, ROUTER_ABI, signer),
        token: new ethers.Contract(config.assets.USDC.address, TOKEN_ABI, signer),
        onTransaction(hash, label, complete) {
          let link = transactionLinks.get(hash);
          if (!link) {
            link = document.createElement('a');
            link.href = `https://basescan.org/tx/${encodeURIComponent(hash)}`;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            byId('admin-router-transactions').append(link);
            transactionLinks.set(hash, link);
          }
          link.textContent = `${label} · ${complete ? 'confirmed' : 'submitted; verify on BaseScan'} · ${hash}`;
        },
      };
    }
    async function run(action) {
      if (busy || payrollBusy) { status('Wait for the current router/payroll operation to finish.', true); return; }
      busy = true;
      updateControls();
      window.dispatchEvent(new window.CustomEvent('decentcanopy:router-busy', { detail: true }));
      try { await action(); }
      catch (error) { status(error.shortMessage || error.message || 'Router operation failed.', true); }
      finally {
        busy = false;
        updateControls();
        window.dispatchEvent(new window.CustomEvent('decentcanopy:router-busy', { detail: false }));
      }
    }
    function initDom() {
      if (!byId('admin-fund-form')) return;
      byId('admin-fund-form').addEventListener('submit', event => {
        event.preventDefault();
        run(lookup);
      });
      byId('admin-fund-slug').addEventListener('input', () => {
        generation++;
        selectedSlug = null;
        selectedFund = null;
        byId('admin-fund-info').textContent = 'Slug changed; inspect this allocation again.';
        updateControls();
      });
      for (const [form, action] of [['admin-create-form', 'create'], ['admin-deposit-form', 'deposit']]) {
        byId(form).addEventListener('submit', event => {
          event.preventDefault();
          run(async () => {
            if (!selectedSlug || selectedSlug !== byId('admin-fund-slug').value.trim()) throw new Error('Inspect the selected allocation first.');
            const slug = selectedSlug;
            const value = action === 'create' ? metadataUri(byId('admin-fund-metadata').value) : byId('admin-deposit-amount').value.trim();
            if (action === 'deposit') depositAmount(value, window.ethers);
            const ctx = await context();
            const question = action === 'create'
              ? `Create ${slug} on the shared Base router?\nMetadata: ${value}\nThis does not activate rewards or change payroll routing.`
              : `Deposit ${value} USDC from your wallet into ${slug} on Base?\nA separate exact-amount token approval may be needed. This is not a payout.`;
            if (!window.confirm(question)) { status('Cancelled. No transaction submitted.'); return; }
            status('Confirm the transaction(s) in your wallet. Waiting for Base confirmation…');
            if (action === 'create') await createAllocation(ctx, slug, value);
            else await deposit(ctx, slug, value);
            status(`${action === 'create' ? 'Allocation created' : 'USDC deposited'} and confirmed on Base. Payroll routing is unchanged.`);
            selectedFund = null;
            updateControls();
            window.dispatchEvent(new window.CustomEvent('decentcanopy:router-updated'));
          });
        });
      }
      window.addEventListener('decentcanopy:admin-open', () => run(async () => {
        await load();
        status('Inspect a named allocation. Current payroll and pinner routing: ' + config.fundSlug + '.');
      }));
      window.addEventListener('decentcanopy:wallet-change', () => {
        generation++;
        selectedFund = null;
        selectedSlug = null;
        updateControls();
      });
      window.addEventListener('decentcanopy:payroll-busy', event => { payrollBusy = event.detail; updateControls(); });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initDom);
    else initDom();
  }
  return { ROUTER_ABI, TOKEN_ABI, allocationId, metadataUri, depositAmount, inspect, createAllocation, deposit, init };
});
