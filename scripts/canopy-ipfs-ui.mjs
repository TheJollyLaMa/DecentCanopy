import { CanopyIPFS, validateManifest } from './canopy-ipfs.mjs';

const byId = id => document.getElementById(id);
const service = new CanopyIPFS();
const dialog = byId('pin-yourself-dialog');
const status = byId('canopy-ipfs-status');
const provider = byId('canopy-ipfs-provider');
const jwt = byId('canopy-ipfs-jwt');
const consent = byId('canopy-ipfs-consent');
const buttons = ['canopy-ipfs-verify', 'canopy-ipfs-download', 'canopy-ipfs-pin'].map(byId);
let busy = false;
let controller;
let generation = 0;

function open(capability = 'backup') {
  if (!dialog.open) dialog.showModal();
  const target = byId(capability === 'rewards' ? 'pinner-signup-title' : 'canopy-ipfs-title');
  target.scrollIntoView({ block: 'nearest' });
  (capability === 'rewards' ? byId('pinner-gateway') : provider).focus();
}
globalThis.CanopyIPFSHost = service.host(open);
byId('ipfs-data-controls').addEventListener('click', () => open());
provider.addEventListener('change', () => {
  byId('canopy-ipfs-key-field').hidden = provider.value === 'local';
  byId('canopy-ipfs-local-note').hidden = provider.value !== 'local';
  jwt.value = '';
  consent.checked = false;
});
byId('canopy-ipfs-provider-form').addEventListener('submit', event => {
  event.preventDefault();
  if (busy) return;
  try {
    service.configure(provider.value, jwt.value.trim());
    jwt.value = '';
    consent.checked = false;
    byId('canopy-ipfs-provider-status').textContent = `${service.session.provider} selected; not yet verified. Credentials stay in this tab. No data uploaded.`;
    status.textContent = 'Provider changed. Verify the published backup before relying on it.';
  } catch (error) {
    status.textContent = `Provider setup failed: ${error.message}`;
  }
});
dialog.addEventListener('close', () => {
  generation++;
  controller?.abort();
  jwt.value = '';
  consent.checked = false;
  service.configure(service.session.provider);
  byId('canopy-ipfs-provider-status').textContent = `${service.session.provider} selected; personal credentials cleared.`;
  status.textContent = 'Controls closed; credentials cleared. Submitted pin requests may still finish; check your provider before retrying.';
});

async function manifest(signal) {
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const url = local ? 'data/ipfs-backup.json'
    : 'https://raw.githubusercontent.com/TheJollyLaMa/DecentCanopy/main/data/ipfs-backup.json';
  const response = await fetch(url, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal });
  if (!response.ok) throw new Error(`Published manifest request failed (HTTP ${response.status}).`);
  const value = validateManifest(await response.json());
  signal.throwIfAborted();
  window.decentCanopyIpfsManifest = value;
  window.dispatchEvent(new CustomEvent('decentcanopy:ipfs-manifest', { detail: value }));
  byId('pin-yourself-cid').textContent = value.cid;
  byId('pin-kubo-command').textContent = `ipfs pin add ${value.cid}`;
  return value;
}
async function action(kind) {
  if (busy) return;
  if (provider.value !== service.session.provider || jwt.value.trim()) {
    status.textContent = 'Choose Use provider to apply your current provider settings first.';
    return;
  }
  busy = true;
  const current = ++generation;
  controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(120000)]);
  const controls = [...buttons, provider, jwt, consent, byId('canopy-ipfs-provider-form').querySelector('button')];
  const optedIn = consent.checked;
  controls.forEach(control => { control.disabled = true; });
  status.textContent = 'Retrieving the published manifest and checking exact backup bytes…';
  try {
    if (kind === 'pin' && !optedIn) throw new Error('Check the explicit public-pinning consent box first.');
    const published = await manifest(signal);
    signal.throwIfAborted();
    if (kind === 'pin') {
      const message = await service.pin(published, { consent: optedIn, signal });
      if (current === generation) status.textContent = message;
    } else {
      const { bytes } = await service.retrieve(published, { signal });
      if (current !== generation) return;
      if (kind === 'download') {
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `decentcanopy-public-backup-${published.cid}.json`;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      status.textContent = `Verified ${bytes.byteLength.toLocaleString()} bytes and matching SHA-256 for ${published.cid}.${kind === 'download' ? ' Recovery download started; live records and unpublished drafts are unchanged.' : ' Retrieval is not proof of independent retention or reward eligibility.'}`;
    }
  } catch (error) {
    if (current === generation) status.textContent = `Could not complete ${kind}: ${error.message}`;
  } finally {
    busy = false;
    controls.forEach(control => { control.disabled = false; });
  }
}
buttons[0].addEventListener('click', () => action('verify'));
buttons[1].addEventListener('click', () => action('download'));
buttons[2].addEventListener('click', () => action('pin'));
