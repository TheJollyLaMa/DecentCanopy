'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  DATA_FILES,
  computeDataDigest,
  createBackupPayload,
  readDataFiles,
  readUploadCid,
  recentCids
} = require('../scripts/pinDataBackup');

test('IPFS backup covers every checked-in canopy snapshot and curated data file', () => {
  assert.deepEqual(DATA_FILES, [
    'contributor-accounts.json',
    'data/activity.json',
    'data/artizen-curation.json',
    'data/artizen.json',
    'data/artizen-archive.json',
    'data/artizen-comprehensive-capture.json',
    'data/artizen-financial-captures.json',
    'data/decent-creators.json',
    'data/associations.json',
    'data/community-creators.json',
    'data/community-pinners.json',
    'data/projects.json',
    'payroll-assets.json',
    'payroll-queue.json',
    'community-rewards.json'
  ]);
});

test('all files selected for the live IPFS backup are valid JSON datasets', async () => {
  const contents = await readDataFiles();
  assert.deepEqual(Object.keys(contents).sort(), DATA_FILES.slice().sort());
  const payload = createBackupPayload(contents, '2026-10-03T12:00:00.000Z');
  assert.equal(payload.files['data/artizen.json'].projects.length > 0, true);
  assert.ok(Array.isArray(payload.files['data/artizen-curation.json'].associations));
  assert.ok(Array.isArray(payload.files['contributor-accounts.json'].contributors));
  assert.ok(Array.isArray(payload.files['payroll-queue.json'].pending));
  assert.ok(payload.files['payroll-assets.json'].assets.ART);
});

test('backup package preserves JSON records and hashes files deterministically', () => {
  const contents = {
    'data/projects.json': Buffer.from('[{"id":"green-tea"}]'),
    'data/artizen.json': Buffer.from('{"projects":[]}')
  };
  const payload = createBackupPayload(contents, '2026-10-03T12:00:00.000Z');

  assert.equal(payload.format, 'decentcanopy-data-backup');
  assert.equal(payload.files['data/projects.json'][0].id, 'green-tea');
  assert.equal(
    computeDataDigest(contents),
    computeDataDigest({
      'data/artizen.json': contents['data/artizen.json'],
      'data/projects.json': contents['data/projects.json']
    })
  );
  assert.notEqual(
    computeDataDigest(contents),
    computeDataDigest({ ...contents, 'data/projects.json': Buffer.from('[]') })
  );
});

test('reads CID values from Pinata upload responses and rejects malformed responses', () => {
  const cid = `bafy${'a'.repeat(55)}`;
  assert.equal(readUploadCid({ data: { cid } }), cid);
  assert.throws(() => readUploadCid({ data: {} }), /valid CID/);
});

test('backup manifest keeps a short, de-duplicated history of recent CIDs for pinner checks', () => {
  const previous = {
    cid: 'bafyprevious000000000000000',
    pinnedAt: '2026-10-01T00:00:00.000Z',
    payloadSha256: 'a'.repeat(64),
    recentCids: [{ cid: 'bafyolder00000000000000000', pinnedAt: '2026-09-30T00:00:00.000Z', payloadSha256: 'b'.repeat(64) }]
  };
  const rows = recentCids(previous, { cid: 'bafycurrent000000000000000', pinnedAt: '2026-10-02T00:00:00.000Z', payloadSha256: 'c'.repeat(64) });
  assert.deepEqual(rows.map(row => row.cid), ['bafycurrent000000000000000', 'bafyolder00000000000000000', 'bafyprevious000000000000000']);
  const many = Array.from({ length: 14 }, (_, index) => ({ cid: `bafy${String(index).padStart(22, '0')}`, pinnedAt: 'x' }));
  assert.equal(recentCids({ recentCids: many }, { cid: 'bafynew0000000000000000000', pinnedAt: 'y' }).length, 10);
});
