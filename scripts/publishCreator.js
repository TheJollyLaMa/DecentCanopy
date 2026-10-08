'use strict';

const { verify, assertNext, CID } = require('./creator-records');
const { readJson, writeJson, requestIdFor } = require('./communityRewards');

async function publishCreator({ envelope, index, verifyMessage, pin, archiveIds = null, now = new Date() }) {
  const record = verify(envelope, verifyMessage);
  if (archiveIds && record.projects.some(p => p.archiveId && !archiveIds.has(p.archiveId))) throw new Error('A historical project reference does not exist in the frozen archive.');
  const age = now - new Date(record.updatedAt);
  if (age > 6 * 60 * 60 * 1000 || age < -10 * 60 * 1000) throw new Error('Publication signature expired; sign a fresh version.');
  const existing = index.creators.find(row => row.record.wallet === record.wallet);
  if (assertNext(record, existing) === 'duplicate') return existing;
  const cid = await pin({ format: 'decentcanopy-signed-creator', version: 1, ...envelope });
  if (!CID.test(cid || '')) throw new Error('Pinning did not return a valid IPFS CID.');
  const entry = { record, cid, message: envelope.message, signature: envelope.signature, publishedAt: now.toISOString() };
  index.creators = index.creators.filter(row => row.record.wallet !== record.wallet).concat(entry);
  index.updatedAt = now.toISOString();
  return entry;
}

async function pinRecord(value, token, fetchImpl = fetch) {
  if (!token) throw new Error('Community publishing is not configured: add the PINATA_JWT repository secret. Your signed export remains portable.');
  const form = new FormData();
  form.append('file', new Blob([JSON.stringify(value)], { type: 'application/json' }), 'decent-creator.json');
  form.append('network', 'public');
  form.append('name', 'DecentCanopy wallet-signed creator');
  const response = await fetchImpl('https://uploads.pinata.cloud/v3/files', {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form, signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`Community IPFS pinning failed (HTTP ${response.status}).`);
  const body = await response.json();
  return body.data?.cid || body.cid;
}

async function main() {
  const { verifyMessage } = require('ethers');
  const event = readJson(process.env.GITHUB_EVENT_PATH);
  if (event.action !== 'creator-publish') throw new Error('Expected a creator-publish event.');
  const envelope = event.client_payload;
  // Reject unauthenticated input before writing even an error receipt.
  const record = verify(envelope, verifyMessage);
  const id = requestIdFor(envelope.signature);
  const path = 'data/decent-creators.json', index = readJson(path);
  let receipt;
  try {
    const snapshot = readJson('data/artizen.json'), curation = readJson('data/artizen-curation.json');
    const archiveIds = new Set([
      ...snapshot.projects.map(p => `artizen-project:${p.id}`),
      ...curation.projects.map(p => `curated-project:${p.slug}`),
    ]);
    const entry = await publishCreator({ envelope, index, verifyMessage, archiveIds, pin: value => pinRecord(value, process.env.PINATA_JWT) });
    receipt = { id, wallet: record.wallet, status: 'published', cid: entry.cid, revision: entry.record.revision };
  } catch (error) {
    console.error(`[publishCreator] ${error.message}`);
    receipt = { id, wallet: record.wallet, status: 'error', reason: error.message };
  }
  index.publications = [{ ...receipt, updatedAt: new Date().toISOString() }, ...(index.publications || []).filter(row => row.id !== id)].slice(0, 500);
  writeJson(path, index);
  console.log(JSON.stringify(receipt));
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { publishCreator, pinRecord };
