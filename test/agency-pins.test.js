'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseList, mergePins, requestPin, waitPinned, CID_V1, MULTIADDR } = require('../scripts/pinAgencyCids');

const CID = 'bafybeieu4ypnyluhjokrpjyjcr6rcguwokvawsgrq7qqcaa264vc2qqt34';
const HOST = '/ip4/74.65.39.96/tcp/4001/p2p/12D3KooWJ2CDmExE9jkZShs5ZpjpZzSjEKAfRNdUE57qRkvT8GMc';

test('CID and host lists are de-duplicated and rejected when malformed', () => {
  assert.deepEqual(parseList(`${CID}, ${CID}\n`, CID_V1, 'CIDv1'), [CID]);
  assert.throws(() => parseList('QmLegacyV0Hash', CID_V1, 'CIDv1'), /Invalid CIDv1: QmLegacyV0Hash/);
  assert.deepEqual(parseList(HOST, MULTIADDR, 'host'), [HOST]);
  assert.throws(() => parseList('/ip4/1.2.3.4/tcp/4001', MULTIADDR, 'host'), /Invalid host/);
  assert.deepEqual(parseList('', MULTIADDR, 'host'), []);
});

test('pin requests send the exact CID, label and host hints with the bearer token', async () => {
  let seen;
  await requestPin(CID, 'DecentMarket site', [HOST], 'jwt', async (url, init) => {
    seen = { url, init };
    return { ok: true, text: async () => '{}' };
  });
  assert.equal(seen.url, 'https://api.pinata.cloud/pinning/pinByHash');
  assert.equal(seen.init.headers.Authorization, 'Bearer jwt');
  assert.deepEqual(JSON.parse(seen.init.body), { hashToPin: CID, pinataMetadata: { name: 'DecentMarket site' }, pinataOptions: { hostNodes: [HOST] } });
  await assert.rejects(requestPin(CID, 'x', [], 'jwt', async () => ({ ok: false, status: 403, text: async () => 'nope' })), /pinByHash/);
});

test('pins are only confirmed when Pinata lists the exact CID as pinned', async () => {
  let calls = 0;
  const fetchImpl = async () => ({ ok: true, json: async () => ({ rows: ++calls < 3 ? [] : [{ ipfs_pin_hash: CID }] }) });
  assert.equal(await waitPinned(CID, 'jwt', { fetchImpl, intervalMs: 0, sleep: async () => {} }), true);
  assert.equal(calls, 3);
  const never = async () => ({ ok: true, json: async () => ({ rows: [{ ipfs_pin_hash: `${CID}x` }] }) });
  assert.equal(await waitPinned(CID, 'jwt', { fetchImpl: never, timeoutMs: 0, sleep: async () => {} }), false);
});

test('manifest keeps earlier pins and updates repeated CIDs in place', () => {
  const first = mergePins({ pins: [] }, [{ cid: CID, label: 'DecentMarket site', status: 'requested' }]);
  const second = mergePins(first, [{ cid: CID, label: 'DecentMarket site', status: 'pinned' }, { cid: 'bafyother000000000000000000', label: 'DecentHead site', status: 'pinned' }]);
  assert.equal(second.pins.length, 2);
  assert.equal(second.pins.find(p => p.cid === CID).status, 'pinned');
  assert.deepEqual(second.pins.map(p => p.label), ['DecentHead site', 'DecentMarket site']);
});

test('repository sites upload tracked non-dot files as one named folder and record their source commit', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { execFileSync } = require('node:child_process');
  const { pinRepoFolder, listRepoFiles, REPO } = require('../scripts/pinAgencyCids');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agency-pin-'));
  const git = (...args) => execFileSync('git', ['-C', dir, ...args]);
  git('init', '-q');
  fs.mkdirSync(path.join(dir, 'img/ens'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.github'));
  for (const rel of ['index.html', 'img/ens/head-header.png', '.github/ci.yml', '.gitignore']) fs.writeFileSync(path.join(dir, rel), rel);
  fs.writeFileSync(path.join(dir, 'untracked.txt'), 'x');
  git('add', '-f', 'index.html', 'img', '.github', '.gitignore');
  assert.deepEqual(listRepoFiles(dir).sort(), ['img/ens/head-header.png', 'index.html']);

  let call;
  const row = await pinRepoFolder(dir, {
    repo: 'TheJollyLaMa/DecentHead', commit: 'abcdef1234567', label: 'DecentHead site', token: 'jwt',
    pinFolderImpl: async (files, token, opts) => { call = { files, token, opts }; return CID; },
  });
  assert.equal(call.opts.folder, 'DecentHead');
  assert.equal(call.opts.root, dir);
  assert.equal(call.opts.name, 'DecentHead site abcdef1');
  assert.deepEqual({ cid: row.cid, status: row.status, source: row.source, fileCount: row.fileCount }, { cid: CID, status: 'pinned', source: { repo: 'TheJollyLaMa/DecentHead', commit: 'abcdef1234567' }, fileCount: 2 });

  await assert.rejects(pinRepoFolder(dir, { repo: 'x/y', commit: 'abc', label: 'l', token: 't', listFiles: () => ['readme.md'], pinFolderImpl: async () => CID }), /no index.html/);
  assert.ok(REPO.test('TheJollyLaMa/Decent_NDA') && !REPO.test('a/b;rm') && !REPO.test('nope'));
  fs.rmSync(dir, { recursive: true, force: true });
});
