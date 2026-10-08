(function () {
  'use strict';

  const ROLES = new Set(['contributor', 'implementer', 'idea-originator', 'tester', 'airdrop', 'pinner']);

  function claimantOf(row) {
    return String(row?.github || row?.claimant || '').toLowerCase();
  }

  // In-app claimants are wallet addresses rather than GitHub logins.
  function personLabel(id) {
    const text = String(id || '');
    return /^0x[a-fA-F0-9]{40}$/.test(text) ? `${text.slice(0, 6)}…${text.slice(-4)}` : `@${text}`;
  }

  // Mirrors registeredRecipient() in scripts/communityRewards.js.
  function registeredRecipient(entry) {
    const role = String(entry.role || 'contributor').toLowerCase();
    const github = String(entry.contributorGithub || '').toLowerCase();
    if (role === 'airdrop') {
      const creator = (state.creators?.creators || []).find(row =>
        claimantOf(row) === github && row.claimIssue === entry.issueRef);
      return creator ? creator.artizenWallet : null;
    }
    if (role === 'pinner') {
      const pinner = (state.pinners?.pinners || []).find(row =>
        claimantOf(row) === github && row.status === 'approved');
      return pinner ? pinner.wallet : null;
    }
    const account = (state.accounts?.contributors || []).find(row => String(row.github || '').toLowerCase() === github);
    return account ? account.walletAddress : null;
  }

  function recipientMatches(entry) {
    const wallet = registeredRecipient(entry);
    return Boolean(wallet && wallet.toLowerCase() === String(entry.contributor || '').toLowerCase());
  }
  const ROUTER_ABI = [
    'function PAYROLL_ROLE() view returns (bytes32)',
    'function CONTRIBUTOR_ADMIN_ROLE() view returns (bytes32)',
    'function hasRole(bytes32 role, address account) view returns (bool)',
    'function funds(bytes32 fundId) view returns (string metadataUri, bool active, bool exists)',
    'function fundBalances(bytes32 fundId, address asset) view returns (uint256)',
    'function approvedAssets(address asset) view returns (bool)',
    'function contributors(address wallet) view returns (bytes32 githubIdHash, bool approved, bool exists)',
    'function setContributorApproved(address wallet, bytes32 githubIdHash, bool approved)',
    'function completedWorkReferences(bytes32 workReference) view returns (bool)',
    'function payout(bytes32 fundId, address asset, address recipient, uint256 amount, bytes32 workReference, bytes32 repositoryIdHash, bytes32 contributorIdHash, string metadataUri, bytes32 metadataHash)',
  ];

  const state = {
    config: null,
    accounts: null,
    queue: null,
    routerState: null,
    ownerAddress: null,
    wallet: null,
    busyIndex: null,
    adminBusy: false,
    error: null,
    localTxByReference: new Map(),
  };

  let panel;
  let overlay;
  let openButton;
  let treeButton;
  let panelOpener;
  let closeButton;
  let refreshButton;
  let statusEl;
  let fundSummaryEl;
  let entriesEl;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[character]);
  }

  function setStatus(message, kind = '') {
    if (!statusEl) return;
    statusEl.textContent = message;
    if (kind) statusEl.dataset.kind = kind;
    else delete statusEl.dataset.kind;
  }

  async function fetchJson(url) {
    const response = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not load ${url} (HTTP ${response.status}).`);
    return response.json();
  }

  function configuredOwner() {
    return state.accounts?.contributors?.find(account => account.role === 'owner') || null;
  }

  function normalizeEntryCurrency(entry) {
    return String(entry.currency || 'ART').trim().toUpperCase();
  }

  function entryRole(entry) {
    return String(entry.role || 'contributor').trim().toLowerCase();
  }

  function workReference(entry) {
    const currency = normalizeEntryCurrency(entry);
    const base = `${entry.issueRef}:${entry.contributorGithub}:${entryRole(entry)}`;
    return ethers.keccak256(ethers.toUtf8Bytes(currency === 'ART' ? base : `${base}:${currency}`));
  }

  function shortAddress(value) {
    return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : 'unknown';
  }

  function explorerTransactionUrl(hash) {
    return `https://basescan.org/tx/${encodeURIComponent(hash)}`;
  }

  function validConfig() {
    if (!state.config || state.config.chainId !== 8453 || !ethers.isAddress(state.config.routerAddress)) {
      throw new Error('The payroll asset configuration is incomplete.');
    }
    if (state.config.fundSlug !== 'decentcanopy-repo-dev' || !state.config.assets?.ART || !state.config.assets?.USDC) {
      throw new Error('Payroll must have configured ART and USDC assets and a fund slug.');
    }
    for (const [symbol, asset] of Object.entries(state.config.assets)) {
      if (!ethers.isAddress(asset.address) || !Number.isInteger(asset.decimals) || asset.decimals < 0 || asset.decimals > 36 ||
        !Number.isInteger(asset.ledgerDecimals) || asset.ledgerDecimals < 0 || asset.ledgerDecimals > asset.decimals) {
        throw new Error(`The configured ${symbol} token address or decimals are invalid.`);
      }
    }
  }

  function createReadProvider() {
    return new ethers.JsonRpcProvider(state.config.rpcUrl, state.config.chainId, { batchMaxCount: 1 });
  }

  function createRouter(providerOrSigner) {
    return new ethers.Contract(state.config.routerAddress, ROUTER_ABI, providerOrSigner);
  }

  function fundRecord(fund) {
    return {
      exists: Boolean(fund.exists ?? fund[2]),
      active: Boolean(fund.active ?? fund[1]),
    };
  }

  async function refreshChainState() {
    validConfig();
    const provider = createReadProvider();
    const code = await provider.getCode(state.config.routerAddress);
    if (!code || code === '0x') {
      throw new Error('No Settlement Router contract is deployed at the configured Base address.');
    }

    const router = createRouter(provider);
    const fundId = ethers.id(state.config.fundSlug);
    const fund = fundRecord(await router.funds(fundId));
    const assetStates = {};
    for (const [symbol, asset] of Object.entries(state.config.assets)) {
      const [approved, balance] = await Promise.all([
        router.approvedAssets(asset.address),
        fund.exists ? router.fundBalances(fundId, asset.address) : 0n,
      ]);
      assetStates[symbol] = { approved, balance };
    }

    const entries = state.queue?.pending || [];
    const completedReferences = new Set();
    for (const entry of entries) {
      try {
        if (await router.completedWorkReferences(workReference(entry))) {
          completedReferences.add(workReference(entry));
        }
      } catch (error) {
        throw new Error(`Could not check on-chain payment status for ${entry.issueRef}: ${error.message}`);
      }
    }
    state.routerState = { fund, assetStates, completedReferences };
  }

  function walletAuthorization() {
    const owner = configuredOwner();
    const wallet = state.wallet;
    const matchesOwner = Boolean(owner?.walletAddress && wallet?.address &&
      owner.walletAddress.toLowerCase() === wallet.address.toLowerCase());
    const hasPayrollRole = Boolean(state.routerState?.hasPayrollRole);
    return {
      ready: matchesOwner && wallet?.chainId === state.config?.chainId && hasPayrollRole,
      matchesOwner,
      hasPayrollRole,
    };
  }

  async function refreshAuthorization() {
    if (!state.wallet || !window.ethereum || !state.config || !state.routerState) {
      state.routerState.hasPayrollRole = false;
      return;
    }
    const owner = configuredOwner();
    if (!owner || owner.walletAddress.toLowerCase() !== state.wallet.address.toLowerCase()) {
      state.routerState.hasPayrollRole = false;
      return;
    }
    if (state.wallet.chainId !== state.config.chainId) {
      state.routerState.hasPayrollRole = false;
      return;
    }
    const provider = createReadProvider();
    const router = createRouter(provider);
    const role = await router.PAYROLL_ROLE();
    state.routerState.hasPayrollRole = await router.hasRole(role, state.wallet.address);
  }

  function entryStatus(entry) {
    if (typeof window.ethers === 'undefined') return 'invalid';
    const currency = normalizeEntryCurrency(entry);
    const asset = state.config?.assets?.[currency];
    if (!asset || !ROLES.has(entryRole(entry))) return 'invalid';
    const reference = workReference(entry);
    if (state.routerState?.completedReferences.has(reference)) return 'paid';
    const assetState = state.routerState?.assetStates[currency];
    if (!state.routerState?.fund.exists) return 'fund-missing';
    if (!state.routerState?.fund.active) return 'fund-inactive';
    if (!assetState?.approved) return 'asset-not-approved';
    if (!recipientMatches(entry)) return 'account-mismatch';
    return 'ready';
  }

  function statusLabel(status) {
    return ({
      paid: 'Already paid on-chain — record the transaction in the GitHub ledger.',
      'fund-missing': `Create the ${state.config.fundSlug} fund on the shared router before paying.`,
      'fund-inactive': 'The repository fund is inactive.',
      'asset-not-approved': 'This token is not approved on the shared router.',
      'account-mismatch': 'The recipient does not match the registered wallet (contributor registry, verified Artizen creator, or approved pinner).',
      invalid: 'This queue entry is invalid or uses an unsupported asset.',
      ready: '',
    })[status] || 'On-chain status is unavailable; refresh to retry.';
  }

  function renderFundSummary() {
    if (!fundSummaryEl) return;
    if (!state.routerState) {
      fundSummaryEl.replaceChildren();
      return;
    }
    const { fund, assetStates } = state.routerState;
    const records = Object.entries(state.config.assets).map(([symbol, asset]) => {
      const assetState = assetStates[symbol];
      const balance = assetState?.balance ?? 0n;
      const formatted = ethers.formatUnits(balance, asset.decimals);
      const approved = assetState?.approved ? 'approved' : 'not approved';
      return `<div class="payroll-fund-asset"><strong>${escapeHtml(symbol)} · ${approved}</strong><span>${escapeHtml(formatted)}</span></div>`;
    }).join('');
    fundSummaryEl.innerHTML =
      `<div class="payroll-fund-asset"><strong>${escapeHtml(state.config.fundSlug)} · ${fund.exists ? fund.active ? 'active' : 'inactive' : 'not created'}</strong><span>Shared router fund</span></div>${records}`;
  }

  function renderEntries() {
    if (!entriesEl) return;
    const entries = state.queue?.pending || [];
    if (entries.length === 0) {
      entriesEl.innerHTML = '<p class="payroll-empty">No pending payroll entries.</p>';
      return;
    }
    const authorization = walletAuthorization();
    entriesEl.innerHTML = entries.map((entry, index) => {
      const currency = normalizeEntryCurrency(entry);
      const role = entryRole(entry);
      const status = entryStatus(entry);
      const reference = window.ethers ? workReference(entry) : '';
      const paidTx = reference ? state.localTxByReference.get(reference) : null;
      const amount = `${escapeHtml(entry.amount)} ${escapeHtml(currency)}`;
      const issueUrl = `https://github.com/${encodeURIComponent(String(entry.issueRef).split('#')[0])}/issues/${encodeURIComponent(String(entry.issueRef).split('#')[1] || '')}`;
      const metadata = [
        `<a href="${issueUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(entry.issueRef)}</a>`,
        escapeHtml(personLabel(entry.contributorGithub)),
        `${escapeHtml(role)} · ${escapeHtml(shortAddress(entry.contributor))}`,
      ].join(' · ');
      const requiresReadiness = status === 'ready' && authorization.ready && !state.error;
      const statusText = state.error || statusLabel(status) || (!authorization.matchesOwner
        ? 'Connect the registered repository owner wallet to enable payouts.'
        : authorization.ready
          ? 'Ready for an owner-authorized Base payout.'
          : authorization.hasPayrollRole
            ? 'Switch the connected wallet to Base.'
            : 'Connected owner wallet does not have PAYROLL_ROLE on the router.');
      const handoff = status === 'paid'
        ? `<div class="payroll-ledger-handoff">After the transaction confirms, run <a href="https://github.com/TheJollyLaMa/DecentCanopy/actions/workflows/settle-payroll.yml" target="_blank" rel="noopener noreferrer">Settle Payroll</a> with contributor <code>${escapeHtml(entry.contributorGithub)}</code>, issue <code>${escapeHtml(entry.issueRef)}</code>, role <code>${escapeHtml(role)}</code>, currency <code>${escapeHtml(currency)}</code>${paidTx ? `, and tx hash <code>${escapeHtml(paidTx)}</code> (<a href="${explorerTransactionUrl(paidTx)}" target="_blank" rel="noopener noreferrer">BaseScan</a>)` : '.'} The workflow records the payout in this repository.`
        : '';
      return `<article class="payroll-entry">
        <div class="payroll-entry-top">
          <span class="payroll-entry-person">${escapeHtml(personLabel(entry.contributorGithub))} · ${escapeHtml(role)}</span>
          <span class="payroll-entry-amount">${amount}</span>
        </div>
        <p class="payroll-entry-meta">${metadata}</p>
        ${statusText ? `<p class="payroll-entry-status">${escapeHtml(statusText)}</p>` : ''}
        ${handoff}
        <div class="payroll-entry-actions">
          ${paidTx ? `<a href="${explorerTransactionUrl(paidTx)}" target="_blank" rel="noopener noreferrer">View confirmed transaction</a>` : '<span></span>'}
          <button class="payroll-pay-button" type="button" data-pay-index="${index}" ${!requiresReadiness || state.busyIndex !== null || state.adminBusy ? 'disabled' : ''}>
            ${state.busyIndex === index ? 'Processing…' : status === 'paid' ? 'Paid on-chain' : 'Pay from fund'}
          </button>
        </div>
      </article>`;
    }).join('');
  }

  async function refresh() {
    if (refreshButton) refreshButton.disabled = true;
    setStatus('Loading the payroll queue and checking the shared router…');
    state.error = null;
    try {
      if (typeof window.ethers === 'undefined') {
        throw new Error('The wallet library did not load; reload the page before opening payroll administration.');
      }
      [state.queue, state.accounts, state.config] = await Promise.all([
        fetchJson('payroll-queue.json'),
        fetchJson('contributor-accounts.json'),
        fetchJson('payroll-assets.json'),
      ]);
      [state.creators, state.pinners] = await Promise.all([
        fetchJson('data/community-creators.json').catch(() => ({ creators: [] })),
        fetchJson('data/community-pinners.json').catch(() => ({ pinners: [] })),
      ]);
      if (!Array.isArray(state.queue.pending) || !Array.isArray(state.queue.settled)) {
        throw new Error('The payroll ledger must have pending and settled arrays.');
      }
      if (!Array.isArray(state.accounts.contributors)) throw new Error('The contributor registry is invalid.');
      const owner = configuredOwner();
      state.ownerAddress = owner?.walletAddress || null;
      updateButtonVisibility();
      await refreshChainState();
      await refreshAuthorization();
      renderFundSummary();
      renderEntries();
      const authorization = walletAuthorization();
      setStatus(
        authorization.ready
          ? `Authorized repository owner on Base · ${state.queue.pending.length} pending entr${state.queue.pending.length === 1 ? 'y' : 'ies'}.`
          : `Read-only queue · ${state.queue.pending.length} pending entr${state.queue.pending.length === 1 ? 'y' : 'ies'}. Payouts require the owner wallet and router role.`,
        authorization.ready ? 'success' : ''
      );
    } catch (error) {
      state.error = error.message || 'Payroll refresh failed.';
      renderFundSummary();
      renderEntries();
      setStatus(state.error, 'error');
    } finally {
      if (refreshButton) refreshButton.disabled = false;
    }
  }

  async function switchToBase() {
    const chainId = state.config.chainId;
    const currentHex = await window.ethereum.request({ method: 'eth_chainId' });
    if (Number.parseInt(currentHex, 16) === chainId) return;
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${chainId.toString(16)}` }],
      });
    } catch (error) {
      if (error.code !== 4902) throw error;
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: `0x${chainId.toString(16)}`,
          chainName: 'Base',
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: [state.config.rpcUrl],
          blockExplorerUrls: ['https://basescan.org'],
        }],
      });
    }
  }

  function transactionArguments(entry, fundId, asset, amount, recipient) {
    const role = entryRole(entry);
    const currency = normalizeEntryCurrency(entry);
    const contributorHash = ethers.id(String(entry.contributorGithub).trim());
    const repository = String(entry.issueRef).split('#')[0];
    const metadataUri = `https://github.com/${entry.issueRef.replace('#', '/issues/')}`;
    const metadataHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({
      issueRef: entry.issueRef,
      contributorGithub: entry.contributorGithub,
      role,
      amount: String(entry.amount),
      currency,
      fund: state.config.fundSlug,
    })));
    return [
      fundId,
      asset.address,
      recipient,
      amount,
      workReference(entry),
      ethers.id(repository),
      contributorHash,
      metadataUri,
      metadataHash,
    ];
  }

  async function payEntry(index) {
    const entry = state.queue?.pending?.[index];
    if (!entry || state.busyIndex !== null || state.adminBusy) return;
    if (!window.ethereum || !state.wallet) {
      setStatus('Connect the registered repository owner wallet from the header before paying.', 'error');
      return;
    }
    state.busyIndex = index;
    window.dispatchEvent(new CustomEvent('decentcanopy:payroll-busy', { detail: true }));
    renderEntries();
    setStatus(`Checking ${entry.amount} ${normalizeEntryCurrency(entry)} for ${personLabel(entry.contributorGithub)}…`);
    try {
      validConfig();
      if (entry.fund && entry.fund.toLowerCase() !== state.config.fundSlug.toLowerCase()) {
        throw new Error(`This entry targets ${entry.fund}, not the configured ${state.config.fundSlug} fund.`);
      }
      const currency = normalizeEntryCurrency(entry);
      const asset = state.config.assets[currency];
      if (!asset) throw new Error(`No configured Base token matches ${currency}.`);
      if (!ROLES.has(entryRole(entry))) throw new Error(`Unsupported payroll role: ${entryRole(entry)}.`);
      if (!recipientMatches(entry)) {
        throw new Error('The queue recipient does not match the registered wallet for this payout role.');
      }
      await switchToBase();
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const connectedAddress = await signer.getAddress();
      if (!state.ownerAddress || connectedAddress.toLowerCase() !== state.ownerAddress.toLowerCase()) {
        throw new Error('Connect the registered repository owner wallet before settling payroll.');
      }
      const assertConnectedOwner = async () => {
        const [accounts, chain] = await Promise.all([
          window.ethereum.request({ method: 'eth_accounts' }),
          window.ethereum.request({ method: 'eth_chainId' }),
        ]);
        if (accounts[0]?.toLowerCase() !== connectedAddress.toLowerCase() ||
          Number.parseInt(chain, 16) !== state.config.chainId || !isOwnerWallet(state.wallet)) {
          throw new Error('The wallet or network changed. Reconnect the owner on Base before paying.');
        }
      };
      const router = createRouter(signer);
      const [payrollRole, contributorAdminRole, fundId, assetApproved] = await Promise.all([
        router.PAYROLL_ROLE(),
        router.CONTRIBUTOR_ADMIN_ROLE(),
        Promise.resolve(ethers.id(state.config.fundSlug)),
        router.approvedAssets(asset.address),
      ]);
      if (!(await router.hasRole(payrollRole, connectedAddress))) {
        throw new Error('The connected wallet does not have PAYROLL_ROLE on the shared router.');
      }
      if (!assetApproved) throw new Error(`${currency} is not approved on the shared router.`);
      const reference = workReference(entry);
      if (await router.completedWorkReferences(reference)) {
        state.routerState?.completedReferences.add(reference);
        throw new Error('This work reference is already paid on-chain. Refresh the queue before continuing.');
      }
      const fund = fundRecord(await router.funds(fundId));
      if (!fund.exists) throw new Error(`Create the ${state.config.fundSlug} fund on the shared router before paying.`);
      if (!fund.active) throw new Error(`The ${state.config.fundSlug} fund is inactive.`);

      const recipient = ethers.getAddress(entry.contributor);
      const contributorHash = ethers.id(String(entry.contributorGithub).trim());
      const contributor = await router.contributors(recipient);
      const storedHash = String(contributor.githubIdHash ?? contributor[0]).toLowerCase();
      if (storedHash !== ethers.ZeroHash.toLowerCase() && storedHash !== contributorHash.toLowerCase()) {
        throw new Error('This wallet is already associated with a different GitHub identity on the router.');
      }
      const amount = ethers.parseUnits(String(entry.amount), asset.decimals);
      const fractionalDigits = String(entry.amount).split('.')[1]?.length || 0;
      if (fractionalDigits > asset.ledgerDecimals) {
        throw new Error(`${currency} ledger amounts support at most ${asset.ledgerDecimals} decimal places.`);
      }
      const available = await router.fundBalances(fundId, asset.address);
      if (available < amount) {
        throw new Error(`Insufficient ${currency} in ${state.config.fundSlug}; available ${ethers.formatUnits(available, asset.decimals)} ${currency}.`);
      }
      const payoutArgs = transactionArguments(entry, fundId, asset, amount, recipient);
      if (!(contributor.approved ?? contributor[1])) {
        if (!(await router.hasRole(contributorAdminRole, connectedAddress))) {
          throw new Error('The connected wallet cannot approve contributors on the shared router.');
        }
        if (!window.confirm(`Approve ${personLabel(entry.contributorGithub)} (${recipient}) on the shared router, then pay ${entry.amount} ${currency}?`)) {
          return;
        }
        setStatus(`Approve ${personLabel(entry.contributorGithub)} as a recipient in your wallet…`);
        await assertConnectedOwner();
        const approvalReceipt = await (await router.setContributorApproved(recipient, contributorHash, true)).wait();
        if (!approvalReceipt || approvalReceipt.status !== 1) throw new Error('Contributor approval did not confirm successfully.');
      } else if (!window.confirm(`Pay ${entry.amount} ${currency} to ${personLabel(entry.contributorGithub)} (${recipient}) from ${state.config.fundSlug}?`)) {
        return;
      }

      await assertConnectedOwner();
      await router.payout.staticCall(...payoutArgs);
      await assertConnectedOwner();
      setStatus(`Confirm the ${entry.amount} ${currency} payout in your wallet…`);
      const transaction = await router.payout(...payoutArgs);
      const receipt = await transaction.wait();
      if (!receipt || receipt.status !== 1) throw new Error('The payout transaction did not confirm successfully.');
      state.localTxByReference.set(reference, transaction.hash);
      state.routerState?.completedReferences.add(reference);
      renderEntries();
      setStatus(`Confirmed on Base. Run Settle Payroll to record the transaction in the GitHub ledger.`, 'success');
    } catch (error) {
      setStatus(`Payout failed: ${error.message || 'wallet or router error'}`, 'error');
    } finally {
      state.busyIndex = null;
      window.dispatchEvent(new CustomEvent('decentcanopy:payroll-busy', { detail: false }));
      renderEntries();
    }
  }

  function openPanel(event) {
    if (!isOwnerWallet(state.wallet)) return;
    panelOpener = event?.currentTarget || treeButton;
    panel?.classList.add('open');
    overlay?.removeAttribute('hidden');
    panel?.setAttribute('aria-hidden', 'false');
    openButton?.setAttribute('aria-expanded', 'true');
    treeButton?.setAttribute('aria-expanded', 'true');
    window.dispatchEvent(new CustomEvent('decentcanopy:admin-open'));
    refresh();
    closeButton?.focus();
  }

  function closePanel() {
    panel?.classList.remove('open');
    overlay?.setAttribute('hidden', '');
    panel?.setAttribute('aria-hidden', 'true');
    openButton?.setAttribute('aria-expanded', 'false');
    treeButton?.setAttribute('aria-expanded', 'false');
    (panelOpener || treeButton)?.focus();
  }

  // UI gate only: the router's PAYROLL_ROLE and the owner check in payEntry remain the real authorization.
  function isOwnerWallet(wallet) {
    const owner = configuredOwner();
    return Boolean(owner?.walletAddress && wallet?.address &&
      owner.walletAddress.toLowerCase() === wallet.address.toLowerCase());
  }

  function updateButtonVisibility() {
    const allowed = isOwnerWallet(state.wallet);
    if (openButton) openButton.hidden = !allowed;
    if (treeButton) {
      treeButton.classList.toggle('admin-ready', allowed);
      treeButton.setAttribute('aria-disabled', String(!allowed));
      treeButton.setAttribute('aria-label', allowed ? 'Open admin workspace' : 'Admin workspace (admin wallet required)');
      treeButton.title = allowed ? 'Open admin workspace' : 'Admin wallet required';
    }
    if (!allowed && panel?.classList.contains('open')) closePanel();
  }

  async function loadAccountsForGate() {
    try {
      state.accounts = await fetchJson('contributor-accounts.json');
    } catch (error) {
      state.accounts = null;
      console.error('Admin wallet registry could not load:', error);
      setStatus(`Admin wallet registry could not load: ${error.message}`, 'error');
    }
    updateButtonVisibility();
  }

  function init() {
    panel = document.getElementById('payroll-panel');
    overlay = document.getElementById('payroll-overlay');
    openButton = document.getElementById('payroll-open-button');
    treeButton = document.getElementById('admin-tree-button');
    closeButton = document.getElementById('payroll-close-button');
    refreshButton = document.getElementById('payroll-refresh-button');
    statusEl = document.getElementById('payroll-panel-status');
    fundSummaryEl = document.getElementById('payroll-fund-summary');
    entriesEl = document.getElementById('payroll-entries');
    if (!panel || !entriesEl) return;

    openButton?.addEventListener('click', openPanel);
    treeButton?.addEventListener('click', openPanel);
    closeButton?.addEventListener('click', closePanel);
    overlay?.addEventListener('click', closePanel);
    refreshButton?.addEventListener('click', refresh);
    window.addEventListener('decentcanopy:router-updated', () => {
      if (panel.classList.contains('open') && state.busyIndex === null) refresh();
    });
    window.addEventListener('decentcanopy:router-busy', event => {
      state.adminBusy = event.detail;
      renderEntries();
    });
    panel.addEventListener('keydown', event => {
      if (event.key === 'Escape') closePanel();
      if (event.key !== 'Tab') return;
      const controls = Array.from(panel.querySelectorAll('button, input, a[href], summary'))
        .filter(control => !control.disabled && control.getClientRects().length);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
    entriesEl.addEventListener('click', event => {
      const button = event.target.closest('[data-pay-index]');
      if (button) payEntry(Number(button.dataset.payIndex));
    });
    window.addEventListener('decentcanopy:wallet-change', event => {
      state.wallet = event.detail;
      updateButtonVisibility();
      if (panel.classList.contains('open')) refresh();
    });
    if (window.decentCanopyWallet) state.wallet = window.decentCanopyWallet;
    loadAccountsForGate();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}());
