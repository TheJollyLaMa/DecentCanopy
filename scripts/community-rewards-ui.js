(function () {
  'use strict';

  const CID_PATTERN = /^[A-Za-z0-9]{20,120}$/;
  const PINATA_PIN_BY_CID = 'https://api.pinata.cloud/v3/files/public/pin_by_cid';
  const DAY_MS = 24 * 60 * 60 * 1000;
  const state = { cid: null, creators: null };

  const byId = id => document.getElementById(id);

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

  async function loadCreators() {
    if (state.creators) return state.creators;
    try {
      const response = await fetch('data/community-creators.json', { cache: 'no-store' });
      state.creators = response.ok ? (await response.json()).creators || [] : [];
    } catch {
      state.creators = [];
    }
    return state.creators;
  }

  async function updateClaimChip(wallet) {
    const chip = byId('airdrop-claim-chip');
    if (!chip) return;
    if (!wallet || !wallet.address) {
      chip.hidden = true;
      return;
    }
    const address = wallet.address.toLowerCase();
    const creators = await loadCreators();
    const joined = creators.some(row => [row.artizenWallet, row.connectedWallet]
      .some(value => value && value.toLowerCase() === address));
    if (joined) {
      chip.hidden = true;
      return;
    }
    const builder = window.CanopyArtizenAccount && window.CanopyArtizenAccount.airdropClaimUrl;
    if (builder) chip.href = builder({ connectedWallet: wallet.address });
    chip.hidden = false;
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
      setStatus('');
      dialog?.showModal();
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

    showManifest(window.decentCanopyIpfsManifest);
    window.addEventListener('decentcanopy:ipfs-manifest', event => showManifest(event.detail));
    window.addEventListener('decentcanopy:wallet-change', event => updateClaimChip(event.detail));
    updateClaimChip(window.decentCanopyWallet);
    loadCommunityPinners();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
