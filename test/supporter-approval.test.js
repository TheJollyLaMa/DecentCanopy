'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { Wallet, id } = require('../relay/node_modules/ethers');
const Records = require('../scripts/creator-records');
const { HEAD_URL, loadPublicIndex, verifyPublicProject, prepare } = require('../scripts/prepare-supporter-approval');

const wallet = new Wallet('0x' + '44'.repeat(32));
const revision = 'a'.repeat(40);
const CID = 'bafy' + 'a'.repeat(55);

async function fixture() {
  const record = Records.validate({
    format: 'decentcanopy-creator', version: 1, consent: true, wallet: wallet.address,
    revision: 1, previousCid: null, updatedAt: '2026-10-08T12:00:00.000Z',
    name: 'Forest Maker', bio: '', website: '', avatar: '', location: null,
    projects: [{ key: 'forest', name: 'Forest', description: '', website: '', image: '', status: 'active', archiveId: '' }],
    funding: [], journey: [],
  });
  const message = Records.message(record);
  const entry = {
    record, message, signature: await wallet.signMessage(message), cid: CID, publishedAt: '2026-10-08T12:01:00.000Z',
  };
  return { version: 1, updatedAt: entry.publishedAt, creators: [entry] };
}

function response(body, status = 200) {
  return { ok: status === 200, status, text: async () => JSON.stringify(body) };
}

test('prepares an immutable public snapshot and the exact wallet-bound project approval', async () => {
  const index = await fixture(), calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    return response(url === HEAD_URL ? { sha: revision } : index);
  };
  const result = await prepare(wallet.address, 'forest', fetchImpl);
  const projectId = `decent-project:${wallet.address.toLowerCase()}:forest`;
  assert.equal(result.project.id, projectId);
  assert.equal(result.project.hash, id(projectId));
  assert.deepEqual(result.proposedApproval.args, [wallet.address.toLowerCase(), projectId, true]);
  assert.equal(result.creator.recordRevision, 1);
  assert.equal(result.source, `https://github.com/TheJollyLaMa/DecentCanopy/blob/${revision}/data/decent-creators.json`);
  assert.deepEqual(calls, [
    HEAD_URL,
    `https://raw.githubusercontent.com/TheJollyLaMa/DecentCanopy/${revision}/data/decent-creators.json`,
    HEAD_URL,
  ]);
});

test('fails closed on invalid signatures, changed records, bad CIDs and duplicate wallets', async () => {
  const index = await fixture(), entry = index.creators[0];
  const cases = [
    { ...entry, signature: await new Wallet('0x' + '55'.repeat(32)).signMessage(entry.message) },
    { ...entry, record: { ...entry.record, name: 'Changed' } },
    { ...entry, cid: 'not-a-cid' },
    { ...entry, publishedAt: 'not-a-date' },
  ];
  for (const bad of cases) {
    assert.throws(() => verifyPublicProject({ ...index, creators: [bad] }, wallet.address, 'forest'));
  }
  assert.throws(() => verifyPublicProject({ ...index, creators: [entry, entry] }, wallet.address, 'forest'), /duplicate/);
  assert.throws(() => verifyPublicProject(index, wallet.address, 'missing'), /not found/);
  assert.throws(() => verifyPublicProject(index, '0x' + '66'.repeat(20), 'forest'), /not found/);
  assert.throws(() => verifyPublicProject(index, wallet.address, '../forest'), /Project key/);
  assert.throws(() => verifyPublicProject({ version: 1, creators: [] }, wallet.address, 'forest'), /index/);
});

test('does not fall back to a local index when the public source fails or changes', async () => {
  await assert.rejects(loadPublicIndex(async () => response({}, 503)), /HTTP 503/);
  let heads = 0;
  const index = await fixture();
  await assert.rejects(loadPublicIndex(async url => {
    if (url !== HEAD_URL) return response(index);
    heads++;
    return response({ sha: heads === 1 ? revision : 'b'.repeat(40) });
  }), /changed during verification/);
});
