import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { CanopyIPFS, validateManifest } from '../scripts/canopy-ipfs.mjs';
import { IPFSSession } from '../scripts/vendor/decent-head/2.0.0/js/ipfs.js';
import { readIPFSHostStatus } from '../scripts/vendor/decent-head/2.0.0/js/ipfs-host.js';

const require = createRequire(import.meta.url);
const { DATA_FILES, validatePayload, MAX_BYTES } = require('../scripts/public-backup.js');
const { DATA_FILES: serverFiles, createBackupPayload, readDataFiles } = require('../scripts/pinDataBackup.js');
const cid = `bafybei${'a'.repeat(52)}`;
const payload = () => ({
  format: 'decentcanopy-data-backup', version: 1, createdAt: '2026-10-22T10:00:00.000Z',
  files: Object.fromEntries(DATA_FILES.map(file => [file, {}])),
});
function fixture(value = payload()) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return { bytes, manifest: { cid, files: [...DATA_FILES], payloadBytes: bytes.length,
    payloadSha256: createHash('sha256').update(bytes).digest('hex') } };
}
function setup(fetchImpl, provider = 'pinata') {
  const calls = [];
  const session = { provider, configure(options) { this.provider = options.provider; },
    async pin(...args) { calls.push(args); } };
  return { service: new CanopyIPFS({ session, fetchImpl }), calls, session };
}

test('public backup schema is shared with the publisher and validates the actual Canopy package', async () => {
  assert.equal(DATA_FILES, serverFiles);
  const original = createBackupPayload(await readDataFiles(), new Date().toISOString());
  assert.equal(validatePayload(original), original);
  assert.throws(() => validatePayload({ ...original, drafts: {} }), /supported/);
  const withDraft = structuredClone(original);
  withDraft.files['decentcanopy-creator-drafts-v1'] = {};
  assert.throws(() => validatePayload(withDraft), /unpublished drafts/);
});

test('manifest validation rejects unsupported CID, missing digest, wrong file set and unbounded size', () => {
  const { manifest } = fixture();
  for (const patch of [{ cid: 'not-a-cid' }, { payloadSha256: '' }, { payloadBytes: MAX_BYTES + 1 },
    { payloadBytes: -1 }, { payloadBytes: 2.5 }, { files: ['private-drafts.json'] }]) {
    assert.throws(() => validateManifest({ ...manifest, ...patch }));
  }
});

test('public retrieval verifies exact bytes without credentials, wallet calls or writes', async () => {
  const { bytes, manifest } = fixture();
  let request;
  const { service, calls } = setup(async function (url, options) {
    assert.equal(this, undefined);
    request = { url, options };
    return new Response(bytes);
  });
  const result = await service.retrieve(manifest);
  assert.deepEqual(result.bytes, bytes);
  assert.equal(request.url, `https://gateway.pinata.cloud/ipfs/${cid}`);
  assert.equal(request.options.method, 'GET');
  assert.equal(request.options.credentials, 'omit');
  assert.equal(request.options.headers, undefined);
  assert.deepEqual(calls, []);
  assert.equal((await readIPFSHostStatus(service.host(() => {}))).backup.state, 'ready');
});

test('local Kubo uses fixed loopback API, not a caller-supplied gateway or credential destination', async () => {
  const { bytes, manifest } = fixture();
  const requests = [];
  const { service } = setup(async (url, options) => { requests.push({ url, options }); return new Response(bytes); }, 'local');
  await service.retrieve({ ...manifest, gatewayUrl: 'https://untrusted.example/' });
  assert.equal(requests[0].url, `http://127.0.0.1:5001/api/v0/cat?arg=${cid}`);
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.headers, undefined);
});

test('shared host status reports pending and error explicitly and never retains stale success after invalid input', async () => {
  const { bytes, manifest } = fixture();
  let finish;
  const { service } = setup(() => new Promise(resolve => { finish = resolve; }));
  const host = service.host(() => {});
  const pending = service.retrieve(manifest);
  assert.equal((await readIPFSHostStatus(host)).backup.state, 'pending');
  finish(new Response(bytes));
  await pending;
  assert.equal((await readIPFSHostStatus(host)).backup.state, 'ready');
  await assert.rejects(service.retrieve({ ...manifest, cid: 'invalid' }), /valid CID/);
  assert.equal(service.verified, null);
  assert.equal((await readIPFSHostStatus(host)).backup.state, 'error');
  service.configure('local');
  assert.equal((await readIPFSHostStatus(host)).backup.state, 'idle');
});

test('offline, HTTP failure, hash mismatch, truncation, oversized streaming and wrong schema never become verified', async () => {
  const { bytes, manifest } = fixture();
  const wrong = fixture({ ...payload(), files: { 'private-draft.json': {} } });
  const cases = [
    [async () => { throw new Error('offline'); }, manifest, /offline/],
    [async () => new Response('forbidden', { status: 403 }), manifest, /HTTP 403/],
    [async () => new Response(bytes), { ...manifest, payloadSha256: '0'.repeat(64) }, /SHA-256/],
    [async () => new Response(bytes.slice(1)), manifest, /byte length/],
    [async () => new Response(new Uint8Array(bytes.length + 1)), manifest, /byte length/],
    [async () => new Response(bytes, { headers: { 'content-length': String(MAX_BYTES + 1) } }), manifest, /20 MiB/],
    [async () => new Response(wrong.bytes), { ...wrong.manifest, files: DATA_FILES }, /unpublished drafts/],
  ];
  for (const [fetchImpl, value, error] of cases) {
    const { service } = setup(fetchImpl);
    await assert.rejects(service.retrieve(value), error);
    assert.equal(service.verified, null);
  }
});

test('pinning requires explicit consent and verified manifest bytes before submitting once', async () => {
  const { bytes, manifest } = fixture();
  let reads = 0;
  const { service, calls } = setup(async () => { reads++; return new Response(bytes); });
  await assert.rejects(service.pin(manifest), /consent/);
  assert.equal(reads, 0);
  const result = await service.pin(manifest, { consent: true });
  assert.equal(reads, 2);
  assert.deepEqual(calls, [[cid, { consent: true }]]);
  assert.match(result, /not proven/);
  assert.equal((await readIPFSHostStatus(service.host(() => {}))).replication.state, 'ready');
  const wrong = setup(async () => new Response(bytes.slice(1)));
  await assert.rejects(wrong.service.pin(manifest, { consent: true }), /byte length/);
  assert.deepEqual(wrong.calls, []);
});

test('pin acceptance with failed read-back is reported distinctly, not as completed replication', async () => {
  const { bytes, manifest } = fixture();
  let reads = 0;
  const { service, calls } = setup(async () => ++reads === 1 ? new Response(bytes) : new Response('', { status: 503 }));
  await assert.rejects(service.pin(manifest, { consent: true }), /accepted, but read-back verification did not finish/);
  assert.equal(calls.length, 1);
  assert.equal(service.verified, null);
  const status = await readIPFSHostStatus(service.host(() => {}));
  assert.equal(status.replication.state, 'error');
  assert.match(status.replication.detail, /accepted, but/);
});

test('aborted verification never submits a pin', async () => {
  const { bytes, manifest } = fixture();
  const controller = new AbortController();
  const { service, calls } = setup(async () => { controller.abort(); return new Response(bytes); });
  await assert.rejects(service.pin(manifest, { consent: true, signal: controller.signal }), /abort/i);
  assert.equal(calls.length, 0);
  assert.equal(service.verified, null);
});

test('failed pin submission retains explicit unconfirmed state', async () => {
  const { bytes, manifest } = fixture();
  const { service, session } = setup(async () => new Response(bytes));
  session.pin = async () => { throw new Error('HTTP 401'); };
  await assert.rejects(service.pin(manifest, { consent: true }), /not confirmed.*401/);
  assert.match(service.pinStatus, /not confirmed/);
});

test('pinned shared session only sends personal credentials directly to Pinata and clears them on reconfigure', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = new EventTarget();
  const session = new IPFSSession({ default: 'pinata', pinata: { uploadUrl: 'https://api.pinata.cloud/pinning/pinFileToIPFS' },
    local: { apiUrl: 'http://127.0.0.1:5001' } });
  try {
    let request;
    globalThis.fetch = async (url, options) => { request = { url, options }; return new Response('{}'); };
    session.configure({ provider: 'pinata', jwt: 'test-only-credential' });
    await session.pin(cid, { consent: true });
    assert.equal(request.url, 'https://api.pinata.cloud/pinning/pinByHash');
    assert.equal(request.options.headers.Authorization, 'Bearer test-only-credential');
    session.configure({ provider: 'pinata' });
    assert.equal(session.snapshot().credentialsConfigured, false);
    await assert.rejects(session.pin(cid, { consent: true }), /Enter your Pinata/);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});

test('both publication paths include vendored storage source and the new browser entry point', () => {
  const files = require('../scripts/siteFiles.js').listSiteFiles();
  for (const file of ['scripts/canopy-ipfs.mjs', 'scripts/canopy-ipfs-ui.mjs', 'scripts/public-backup.js',
    'scripts/vendor/decent-head/2.0.0/js/ipfs.js', 'scripts/vendor/decent-head/2.0.0/LICENSE', 'scripts/vendor/decent-head/2.0.0/NOTICE']) {
    assert.ok(files.includes(file), file);
  }
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /type="module" src="scripts\/canopy-ipfs-ui.mjs"/);
  assert.doesNotMatch(html, /id="pin-pinata-form"/);
});
