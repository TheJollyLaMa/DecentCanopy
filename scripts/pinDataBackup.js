'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DATA_FILES = [
  'contributor-accounts.json',
  'data/activity.json',
  'data/artizen-curation.json',
  'data/artizen.json',
  'data/associations.json',
  'data/projects.json',
  'payroll-assets.json',
  'payroll-queue.json'
];
const BACKUP_MANIFEST_PATH = path.join(ROOT, 'data', 'ipfs-backup.json');
const PINATA_UPLOAD_URL = 'https://uploads.pinata.cloud/v3/files';
const PINATA_GATEWAY_URL = 'https://gateway.pinata.cloud/ipfs/';

function computeDataDigest(contents) {
  const hash = crypto.createHash('sha256');
  Object.keys(contents).sort().forEach((filePath) => {
    hash.update(filePath);
    hash.update('\0');
    hash.update(contents[filePath]);
    hash.update('\0');
  });
  return hash.digest('hex');
}

function createBackupPayload(contents, createdAt) {
  const files = {};
  Object.keys(contents).sort().forEach((filePath) => {
    files[filePath] = JSON.parse(contents[filePath].toString('utf8'));
  });
  return {
    format: 'decentcanopy-data-backup',
    version: 1,
    createdAt,
    files
  };
}

function readUploadCid(responseBody) {
  const cid = responseBody?.data?.cid || responseBody?.cid;
  if (typeof cid !== 'string' || !/^[A-Za-z0-9]{20,120}$/.test(cid)) {
    throw new Error('Pinata upload response did not contain a valid CID.');
  }
  return cid;
}

async function readDataFiles() {
  const contents = {};
  for (const relativePath of DATA_FILES) {
    const content = await fs.readFile(path.join(ROOT, relativePath));
    JSON.parse(content.toString('utf8'));
    contents[relativePath] = content;
  }
  return contents;
}

async function readExistingManifest() {
  try {
    return JSON.parse(await fs.readFile(BACKUP_MANIFEST_PATH, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`Could not read the existing IPFS backup manifest: ${error.message}`);
  }
}

async function main() {
  const token = process.env.PINATA_JWT;
  if (!token) throw new Error('PINATA_JWT is required; configure it as a GitHub Actions secret.');

  const contents = await readDataFiles();
  const dataSha256 = computeDataDigest(contents);
  const previous = await readExistingManifest();
  if (previous?.dataSha256 === dataSha256 && previous?.cid) {
    console.log(`Canopy data is unchanged; existing IPFS backup is ${previous.cid}.`);
    return;
  }

  const createdAt = new Date().toISOString();
  const payload = createBackupPayload(contents, createdAt);
  const form = new FormData();
  form.append('file', new Blob([JSON.stringify(payload)], { type: 'application/json' }), 'decentcanopy-data-backup.json');
  form.append('network', 'public');
  form.append('name', `DecentCanopy data backup ${createdAt}`);

  const response = await fetch(PINATA_UPLOAD_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  let responseBody;
  try {
    responseBody = await response.json();
  } catch {
    throw new Error(`Pinata returned a non-JSON response (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    throw new Error(`Pinata upload failed with HTTP ${response.status}: ${responseBody?.error || responseBody?.message || 'request rejected'}`);
  }
  const cid = readUploadCid(responseBody);
  const manifest = {
    provider: 'Pinata',
    cid,
    uri: `ipfs://${cid}`,
    gatewayUrl: `${PINATA_GATEWAY_URL}${cid}`,
    pinnedAt: createdAt,
    dataSha256,
    files: DATA_FILES
  };
  const temporaryPath = `${BACKUP_MANIFEST_PATH}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await fs.rename(temporaryPath, BACKUP_MANIFEST_PATH);
  console.log(`Pinned ${DATA_FILES.length} canopy data files to ${manifest.uri}.`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[pinDataBackup] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { DATA_FILES, computeDataDigest, createBackupPayload, readDataFiles, readUploadCid };
