'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { imageUrl, BUNDLED } = require('../scripts/creator-images');
const { listSiteFiles } = require('../scripts/siteFiles');
const cid = 'bafkreicdvtxkjiz36nfiulfs47shwx6fgp5i7n5l3dnyhv5pd7mbs3hmie';

test('known IPFS avatar resolves to identical bundled content across supported gateways', () => {
  for (const url of [
    `https://ipfs.io/ipfs/${cid}`, `https://dweb.link/ipfs/${cid}/`,
    `https://gateway.pinata.cloud/ipfs/${cid}?download=true`,
    `https://${cid}.ipfs.dweb.link/`, `https://${cid}.ipfs.inbrowser.link/`,
  ]) assert.equal(imageUrl(url), BUNDLED[cid]);
});
test('unknown images and different IPFS paths remain unchanged', () => {
  for (const url of [
    '', 'https://example.org/avatar.png', `https://example.org/ipfs/${cid}`,
    `https://ipfs.io/ipfs/${cid}/different.png`, 'https://ipfs.io/ipfs/bafyunknown',
    `http://ipfs.io/ipfs/${cid}`, `https://name:secret@ipfs.io/ipfs/${cid}`,
  ]) assert.equal(imageUrl(url), url);
});
test('bundled avatar bytes match the raw SHA-256 CID and ship in Pages and IPFS staging', () => {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let bits = 0, value = 0;
  const bytes = [];
  for (const char of cid.slice(1)) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((value >> bits) & 255); }
  }
  const decoded = Buffer.from(bytes);
  assert.equal(decoded.subarray(0, 4).toString('hex'), '01551220');
  const file = fs.readFileSync(path.resolve(__dirname, '..', BUNDLED[cid]));
  assert.deepEqual(crypto.createHash('sha256').update(file).digest(), decoded.subarray(4));
  assert.equal(file.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.ok(listSiteFiles().includes(BUNDLED[cid]));
  assert.ok(listSiteFiles().includes('scripts/creator-images.js'));
});
