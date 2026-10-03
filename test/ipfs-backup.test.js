'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  DATA_FILES,
  computeDataDigest,
  createBackupPayload,
  readDataFiles,
  readUploadCid
} = require('../scripts/pinDataBackup');

test('IPFS backup covers every checked-in canopy snapshot and curated data file', () => {
  assert.deepEqual(DATA_FILES, [
    'contributor-accounts.json',
    'data/activity.json',
    'data/artizen-curation.json',
    'data/artizen.json',
    'data/associations.json',
    'data/projects.json',
    'payroll-assets.json',
    'payroll-queue.json'
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
