'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { listSiteFiles, stageSite } = require('../scripts/siteFiles');
const { digestSite, nextRecent, pinFolder, siteUrls, KEEP_VERSIONS } = require('../scripts/pinSite');

test('site file list includes both entry pages and no repo-only files', () => {
  const files = listSiteFiles();
  assert.ok(files.includes('index.html'));
  assert.ok(files.includes('rabbit-hole/index.html'));
  assert.ok(files.includes('data/decent-creators.json'));
  assert.ok(!files.some(file => file.startsWith('relay/') || file.startsWith('test/') || file === 'ipfs-site.json'));
  assert.ok(!files.some(file => path.basename(file).startsWith('.')));
});

test('staging copies the same files the digest covers', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-'));
  try {
    const files = stageSite(dir);
    assert.deepEqual(digestSite(files, dir), digestSite(files));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('folder upload sends every file under one folder and returns a CIDv1', async () => {
  const cid = `bafybei${'a'.repeat(52)}`;
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, form: init.body, auth: init.headers.Authorization };
    return new Response(JSON.stringify({ IpfsHash: cid }), { status: 200 });
  };
  const result = await pinFolder(['index.html', 'rabbit-hole/index.html'], 'jwt', { name: 'test', fetchImpl });
  assert.equal(result, cid);
  assert.equal(seen.auth, 'Bearer jwt');
  assert.deepEqual(seen.form.getAll('file').map(file => file.name), ['decentcanopy/index.html', 'decentcanopy/rabbit-hole/index.html']);
  assert.equal(JSON.parse(seen.form.get('pinataOptions')).cidVersion, 1);
});

test('folder upload explains missing Pinata permissions', async () => {
  const fetchImpl = async () => new Response('forbidden', { status: 403 });
  await assert.rejects(pinFolder(['index.html'], 'jwt', { name: 't', fetchImpl }), /pinFileToIPFS/);
});

test('recent versions are bounded and gateway URLs use subdomains', () => {
  const rows = Array.from({ length: KEEP_VERSIONS + 2 }, (_, i) => ({ cid: `bafybei${'abcdefgh'[i].repeat(52)}` }));
  const { keep, drop } = nextRecent({ recent: rows.slice(1) }, rows[0]);
  assert.equal(keep.length, KEEP_VERSIONS);
  assert.equal(drop.length, 2);
  assert.equal(siteUrls('bafyx').inbrowser, 'https://bafyx.ipfs.inbrowser.link/');
});
