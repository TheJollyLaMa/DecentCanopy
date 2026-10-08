(function () {
  'use strict';

  const CID_PATTERN = /^[A-Za-z0-9]{20,120}$/;
  const PINATA_PIN_BY_CID = 'https://api.pinata.cloud/v3/files/public/pin_by_cid';
  const DAY_MS = 24 * 60 * 60 * 1000;
  const RELAY_TIMEOUT_MS = 75 * 1000;
  const POLL_INTERVAL_MS = 10 * 1000;
  const POLL_LIMIT = 30;
  const PENDING_KEY = 'decentcanopy:reward-requests';
  const state = { cid: null, config: null, owner: undefined, polls: new Map() };

  const byId = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const shortWallet = value => (value ? `${value.slice(0, 6)}…${value.slice(-4)}` : '');

  function setStatus(message) {
    const status = byId('pin-yourself-status');
    if (status) status.textContent = message;
  }

  async function copy(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(`${label} copied.`);
    } catch {
      setStatus(`Copy failed; select the ${label.toLowerCase()} and copy it manually.`);
    }
  }

  function showManifest(manifest) {
    if (!manifest || !CID_PATTERN.test(manifest.cid || '')) return;
    state.cid = manifest.cid;
    const cid = byId('pin-yourself-cid');
    const kubo = byId('pin-kubo-command');
    if (cid) cid.textContent = manifest.cid;
    if (kubo) kubo.textContent = `ipfs pin add ${manifest.cid}`;
  }

  async function loadCommunityPinners() {
    const line = byId('ipfs-community-pinners');
    if (!line) return;
    try {
      const response = await fetch(`data/community-pinners.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) return;
      const registry = await response.json();
      const approved = (registry.pinners || []).filter(pinner => pinner.status === 'approved');
      const active = approved.filter(pinner => pinner.lastCheck?.ok
        && Date.now() - new Date(pinner.lastCheck.checkedAt) <= 8 * DAY_MS);
      line.textContent = approved.length
        ? `Also pinned by ${active.length} of ${approved.length} community node${approved.length === 1 ? '' : 's'} (passed this week's gateway check).`
        : 'No community pinners yet. Be the first!';
      line.hidden = false;
    } catch {
      // The pinner count is optional; the backup status still renders without it.
    }
  }

  async function loadJson(file) {
    const response = await fetch(`${file}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${file} returned ${response.status}`);
    return response.json();
  }

  async function loadConfig() {
    if (!state.config) state.config = await loadJson('community-rewards.json');
    return state.config;
  }

  async function relayUrl() {
    const url = (await loadConfig()).relay?.url;
    return url ? url.replace(/\/+$/, '') : null;
  }

  // Free hosting sleeps when idle; ping on dialog open so the relay is awake by submit time.
  async function warmRelay() {
    const url = await relayUrl();
    if (url) fetch(`${url}/health`, { cache: 'no-store' }).catch(() => {});
  }

  function storedRequests() {
    try {
      return JSON.parse(localStorage.getItem(PENDING_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function rememberRequest(wallet, type, id) {
    const all = storedRequests();
    all[wallet] = { ...(all[wallet] || {}), [type]: { id, at: new Date().toISOString() } };
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify(all));
    } catch {
      // Private browsing can block storage; status polling still works for this tab.
    }
  }

  async function latestRequest(wallet, type) {
    const rows = (await loadJson('data/community-requests.json')).requests || [];
    const published = rows.find(row => row.signer === wallet && row.type === type);
    const local = storedRequests()[wallet]?.[type];
    if (published && (!local || published.id === local.id || published.updatedAt >= local.at)) return published;
    if (local && Date.now() - new Date(local.at) < DAY_MS) return { id: local.id, status: 'processing' };
    return published || null;
  }

  function setText(id, message, isError = false) {
    const element = byId(id);
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('is-error', Boolean(isError));
  }

  function utf8Hex(text) {
    return `0x${Array.from(new TextEncoder().encode(text), byte => byte.toString(16).padStart(2, '0')).join('')}`;
  }

  function connectedWallet() {
    const wallet = window.decentCanopyWallet;
    return wallet && wallet.address ? wallet.address : null;
  }

  async function signAndSend(action, data) {
    const wallet = connectedWallet();
    if (!wallet || !window.ethereum) throw new Error('Connect your wallet with the header button first.');
    const messages = window.DecentCanopyRewardMessages;
    const url = await relayUrl();
    if (!messages || !url) throw new Error('In-app signing is not configured yet.');
    const message = messages.buildRewardMessage({ action, wallet, data });
    const signature = await window.ethereum.request({ method: 'personal_sign', params: [utf8Hex(message), wallet] });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RELAY_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(`${url}/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, signature }),
        signal: controller.signal,
      });
    } catch (error) {
      throw new Error(error.name === 'AbortError'
        ? 'The relay did not answer in time. Please try again in a minute.'
        : 'Could not reach the relay. Please try again or use the GitHub form.');
    } finally {
      clearTimeout(timer);
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `The relay returned ${response.status}.`);
    return { id: payload.id, wallet: wallet.toLowerCase() };
  }

  const STATUS_TEXT = {
    processing: 'Signed and sent. The canopy bot is processing it…',
    queued: 'Reward queued on the payroll. Queued is not paid; settlement requires available funding and a confirmed transaction.',
    'needs-review': '🤝 Received. The maintainer will review it soon.',
    approved: '✅ Approved! Welcome aboard.',
    rejected: '❌ Not accepted',
    error: '⚠️ Could not finish',
  };

  function statusLine(row) {
    const text = STATUS_TEXT[row.status] || `Status: ${row.status}`;
    const reason = row.reason && ['rejected', 'error', 'needs-review'].includes(row.status)
      ? `${row.status === 'needs-review' ? ' Bot note' : ''}: ${row.reason}` : '';
    const receipt = row.issueRef ? ` Receipt: ${row.issueRef}.` : '';
    return `${text}${reason}${receipt}`;
  }

  async function pollStatus(id, statusId, onDone, waiting = ['processing']) {
    const url = await relayUrl();
    if (!url || state.polls.has(id)) return;
    let attempts = 0;
    const tick = async () => {
      attempts += 1;
      try {
        const response = await fetch(`${url}/requests/${id}`, { cache: 'no-store' });
        const row = await response.json();
        if (!waiting.includes(row.status) || row.status === 'processing') setText(statusId, statusLine(row), ['rejected', 'error'].includes(row.status));
        if (!waiting.includes(row.status)) {
          state.polls.delete(id);
          if (onDone) onDone(row);
          return;
        }
      } catch {
        // Keep polling; the relay may be waking up.
      }
      if (attempts < POLL_LIMIT) state.polls.set(id, setTimeout(tick, POLL_INTERVAL_MS));
      else state.polls.delete(id);
    };
    state.polls.set(id, setTimeout(tick, 4000));
  }

  async function submitPinner(event) {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    const data = {
      commitment: byId('pinner-commitment').checked,
      gateway: byId('pinner-gateway').value.trim(),
      setup: byId('pinner-setup').value,
    };
    if (!/^https:\/\//.test(data.gateway)) {
      setText('pinner-signup-status', 'The gateway must be a public https:// URL.', true);
      return;
    }

    async function openPinnerDialog() {
      setStatus('');
      byId('pin-yourself-dialog')?.showModal();
      try {
        await warmRelay();
        const wallet = connectedWallet();
        if (!wallet) return;
        const pending = await latestRequest(wallet.toLowerCase(), 'pinner');
        if (pending) {
          setText('pinner-signup-status', statusLine(pending), ['rejected', 'error'].includes(pending.status));
          if (pending.status === 'processing') pollStatus(pending.id, 'pinner-signup-status');
        }
      } catch (error) {
        setText('pinner-signup-status', `Could not load pinning service or request status: ${error.message}`, true);
      }
    }
    button.disabled = true;
    setText('pinner-signup-status', 'Check your wallet to sign the request (free, no transaction)…');
    try {
      const { id, wallet } = await signAndSend('pinner-request', data);
      rememberRequest(wallet, 'pinner', id);
      setText('pinner-signup-status', STATUS_TEXT.processing);
      pollStatus(id, 'pinner-signup-status');
    } catch (error) {
      setText('pinner-signup-status', error.message || 'Signing was cancelled.', true);
    } finally {
      button.disabled = false;
    }
  }

  async function ownerWallet() {
    if (state.owner !== undefined) return state.owner;
    try {
      const accounts = await loadJson('contributor-accounts.json');
      const owner = (accounts.contributors || []).find(row => row.role === 'owner');
      state.owner = owner?.walletAddress ? owner.walletAddress.toLowerCase() : null;
    } catch {
      state.owner = null;
    }
    return state.owner;
  }

  function describeRequest(row) {
    const summary = row.summary || {};
    const check = row.gatewayCheck ? (row.gatewayCheck.ok ? '✅ gateway serves the backup' : `⚠️ gateway check: ${row.gatewayCheck.reason}`) : '';
    return `<strong>📌 Pinner · ${esc(shortWallet(row.signer))}</strong>
        <small>${esc(summary.gateway)} · ${esc(summary.provider || '')}</small>
        <small>${esc(check)}</small>`;
  }

  async function renderReviews() {
    const section = byId('reward-review');
    const list = byId('reward-review-list');
    if (!section || !list) return;
    const wallet = connectedWallet();
    const owner = await ownerWallet();
    if (!wallet || !owner || wallet.toLowerCase() !== owner) {
      section.hidden = true;
      return;
    }
    let rows = [];
    try {
      rows = ((await loadJson('data/community-requests.json')).requests || []).filter(row => row.status === 'needs-review' && row.type === 'pinner');
    } catch {
      rows = [];
    }
    section.hidden = false;
    list.innerHTML = rows.length
      ? rows.map(row => `<div class="reward-review-item" data-request-id="${esc(row.id)}">
          ${describeRequest(row)}
          <div class="reward-review-actions">
            <input type="text" maxlength="200" placeholder="Note (optional)" aria-label="Review note" />
            <button class="toolbar-btn" type="button" data-review="approve">Approve</button>
            <button class="toolbar-btn" type="button" data-review="reject">Reject</button>
          </div>
        </div>`).join('')
      : '<p class="payroll-empty">No in-app reward requests are waiting.</p>';
  }

  async function reviewClick(event) {
    const button = event.target.closest('[data-review]');
    if (!button) return;
    const item = button.closest('[data-request-id]');
    const decision = button.dataset.review;
    const note = item.querySelector('input')?.value.trim() || '';
    item.querySelectorAll('button').forEach(control => { control.disabled = true; });
    setText('reward-review-status', `Sign to ${decision} this request…`);
    try {
      const requestId = item.dataset.requestId;
      await signAndSend('reward-review', { requestId, decision, note });
      setText('reward-review-status', `Sent. The bot will ${decision === 'approve' ? 'queue it' : 'close it'} shortly.`);
      item.remove();
      pollStatus(requestId, 'reward-review-status', null, ['processing', 'needs-review']);
    } catch (error) {
      setText('reward-review-status', error.message || 'Signing was cancelled.', true);
      item.querySelectorAll('button').forEach(control => { control.disabled = false; });
    }
  }

  function interceptRewardLinks(event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
    const pinner = event.target.closest('[data-reward-pinner]');
    if (!pinner) return;
    event.preventDefault();
    byId('canopy-about-dialog')?.open && byId('canopy-about-dialog').close();
    openPinnerDialog();
    byId('pinner-signup-title')?.scrollIntoView({ block: 'start' });
  }

  async function pinWithPinata(event) {
    event.preventDefault();
    const input = byId('pin-pinata-jwt');
    const jwt = input ? input.value.trim() : '';
    if (!state.cid) {
      setStatus('No backup CID is published yet, so there is nothing to pin.');
      return;
    }
    if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(jwt)) {
      setStatus('That does not look like a Pinata JWT (three dot-separated parts).');
      return;
    }
    setStatus('Asking Pinata to pin the canopy CID…');
    try {
      const response = await fetch(PINATA_PIN_BY_CID, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cid: state.cid, name: 'decentcanopy-data-backup' }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message || payload.error || `HTTP ${response.status}`);
      setStatus(`Pinata accepted the request (${payload.data?.status || 'queued'}). Thank you for keeping the canopy alive! 🌳`);
    } catch (error) {
      setStatus(`Pinata could not pin it: ${error.message}. You can also pin by CID in the Pinata dashboard.`);
    } finally {
      if (input) input.value = '';
    }
  }

  function init() {
    const dialog = byId('pin-yourself-dialog');
    byId('ipfs-pin-yourself')?.addEventListener('click', () => {
      openPinnerDialog();
    });
    dialog?.addEventListener('click', event => {
      if (event.target === dialog) dialog.close();
    });
    dialog?.addEventListener('close', () => {
      const input = byId('pin-pinata-jwt');
      if (input) input.value = '';
    });
    byId('pin-copy-cid')?.addEventListener('click', () => state.cid && copy(state.cid, 'CID'));
    byId('pin-copy-kubo')?.addEventListener('click', () => state.cid && copy(`ipfs pin add ${state.cid}`, 'Command'));
    byId('pin-pinata-form')?.addEventListener('submit', pinWithPinata);
    byId('pinner-signup-form')?.addEventListener('submit', submitPinner);
    byId('reward-review-list')?.addEventListener('click', reviewClick);
    byId('payroll-refresh-button')?.addEventListener('click', renderReviews);
    window.addEventListener('decentcanopy:admin-open', renderReviews);
    document.addEventListener('click', interceptRewardLinks);

    showManifest(window.decentCanopyIpfsManifest);
    window.addEventListener('decentcanopy:ipfs-manifest', event => showManifest(event.detail));
    window.addEventListener('decentcanopy:wallet-change', () => {
      renderReviews();
    });
    loadCommunityPinners();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
