import { IPFSSession, validCID } from './vendor/decent-head/2.0.0/js/ipfs.js';
import { validateIPFSHost } from './vendor/decent-head/2.0.0/js/ipfs-host.js';
import './public-backup.js';

const { MAX_BYTES, validateFiles, validatePayload } = globalThis.CanopyPublicBackup;
const OPTIONS = {
  default: 'pinata',
  pinata: { uploadUrl: 'https://api.pinata.cloud/pinning/pinFileToIPFS' },
  local: { apiUrl: 'http://127.0.0.1:5001' },
  gateway: 'https://gateway.pinata.cloud/ipfs/',
};

export function validateManifest(manifest) {
  if (!manifest || !validCID(manifest.cid) ||
      !/^[a-f0-9]{64}$/.test(manifest.payloadSha256 || '') ||
      !Number.isSafeInteger(manifest.payloadBytes) || manifest.payloadBytes < 1 || manifest.payloadBytes > MAX_BYTES) {
    throw new Error('Published backup needs a valid CID, SHA-256 and byte length (at most 20 MiB).');
  }
  validateFiles(manifest.files);
  return { cid: manifest.cid, payloadSha256: manifest.payloadSha256, payloadBytes: manifest.payloadBytes, files: [...manifest.files] };
}

async function readBytes(response, expectedLength) {
  const length = response.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES)) throw new Error('Backup response exceeds the 20 MiB limit.');
  if (!response.body?.getReader) throw new Error('This browser cannot stream and safely verify the backup.');
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > expectedLength || total > MAX_BYTES) throw new Error('Backup byte length does not match the published manifest.');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  if (total !== expectedLength) throw new Error('Backup byte length does not match the published manifest.');
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export class CanopyIPFS {
  constructor({ session = new IPFSSession(OPTIONS), fetchImpl = fetch } = {}) {
    this.session = session;
    this.fetch = (...args) => fetchImpl(...args);
    this.verified = null;
    this.backupStatus = { state: 'idle', detail: 'Published backup not verified in this tab; drafts are excluded.' };
    this.pinState = 'idle';
    this.pinStatus = 'No pin requested in this tab.';
  }
  configure(provider, jwt = '') {
    this.session.configure({ provider, jwt });
    this.verified = null;
    this.backupStatus = { state: 'idle', detail: 'Provider selected; published backup not yet verified. Drafts are excluded.' };
    this.pinState = 'idle';
    this.pinStatus = 'Provider session reset; check your provider for any earlier pin requests.';
  }
  async retrieve(value, { signal } = {}) {
    this.verified = null;
    this.backupStatus = { state: 'pending', detail: 'Retrieving and verifying the published public backup.' };
    try {
      const manifest = validateManifest(value);
      const local = this.session.provider === 'local';
      const url = local
        ? `${OPTIONS.local.apiUrl}/api/v0/cat?arg=${encodeURIComponent(manifest.cid)}`
        : `${OPTIONS.gateway}${manifest.cid}`;
      const response = await this.fetch(url, {
        method: local ? 'POST' : 'GET', cache: 'no-store', credentials: 'omit',
        referrerPolicy: 'no-referrer', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000),
      });
      if (!response.ok) throw new Error(`Backup retrieval failed (HTTP ${response.status}); check provider availability and local Kubo CORS settings.`);
      const bytes = await readBytes(response, manifest.payloadBytes);
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      const sha256 = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
      if (sha256 !== manifest.payloadSha256) throw new Error('Backup SHA-256 does not match the published manifest; do not use or pin these bytes.');
      validatePayload(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
      signal?.throwIfAborted();
      const result = { manifest, bytes };
      this.verified = result;
      this.backupStatus = { state: 'ready', detail: `Matching published bytes verified for ${manifest.cid}.` };
      return result;
    } catch (error) {
      this.backupStatus = { state: 'error', detail: error.message };
      throw error;
    }
  }
  async pin(value, { consent = false, signal } = {}) {
    if (!consent) throw new Error('Explicit public-pinning consent is required.');
    const manifest = validateManifest(value);
    await this.retrieve(manifest, { signal });
    signal?.throwIfAborted();
    this.pinState = 'pending';
    this.pinStatus = 'Pin request being submitted; acceptance is not yet confirmed.';
    try {
      await this.session.pin(manifest.cid, { consent: true });
    } catch (error) {
      this.pinState = 'error';
      this.pinStatus = 'Pin submission was not confirmed. Check your provider before retrying.';
      throw new Error(`${this.pinStatus} ${error.message}`);
    }
    this.pinStatus = 'Pin request accepted; checking matching bytes. This is not retention or reward proof.';
    try {
      await this.retrieve(manifest, { signal });
    } catch (error) {
      this.pinState = 'error';
      this.pinStatus = `Pin request accepted, but read-back verification did not finish: ${error.message}. Check your provider before retrying.`;
      throw new Error(this.pinStatus);
    }
    this.pinState = 'ready';
    this.pinStatus = 'Pin request accepted and matching backup bytes retrieved. Retention, independence and reward eligibility are not proven.';
    return this.pinStatus;
  }
  host(open) {
    return validateIPFSHost({
      version: 1, label: 'DecentCanopy public data',
      capabilities: {
        backup: { open: () => open('backup') },
        replication: { open: () => open('replication') },
        rewards: { open: () => open('rewards') },
      },
      getStatus: async () => ({
        backup: { ...this.backupStatus },
        replication: { state: this.pinState, detail: this.pinStatus },
        rewards: { state: 'idle', detail: 'Existing Canopy approval, matching-byte checks, funding and authorized settlement remain required; pinning does not pay.' },
      }),
    });
  }
}
