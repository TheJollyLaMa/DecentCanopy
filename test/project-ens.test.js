'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ENS = require('../scripts/project-ens');
const Records = require('../scripts/creator-records');
const { Wallet, verifyMessage } = require('../relay/node_modules/ethers');
const wallet = '0x807061df657a7697c04045da7d16d941861caabc';
const canopy = { key: '0e78af11-6bb7-4907-aeb4-23f6ce3ed0e6', website: '' };
const cid = 'bafybeia3rpssssaw66tjeyfjruskllsxtjwzmqxnosrpntk7n6dyxgcuae';
test('ENS association is scoped to the exact project or declared name, not display name', () => {
  assert.equal(ENS.nameFor(wallet, canopy), 'decentcanopy.eth');
  assert.equal(ENS.nameFor('0x' + '11'.repeat(20), canopy), '');
  assert.equal(ENS.nameFor(wallet, { key: 'copy', name: 'DecentCanopy', website: '' }), '');
  assert.equal(ENS.nameFor(wallet, { ...canopy, ens: 'custom.eth' }), 'custom.eth');
  assert.equal(ENS.nameFor(wallet, { website: 'https://bignuten.thejollylama.eth.limo/' }), 'bignuten.thejollylama.eth');
  assert.equal(ENS.nameFor(wallet, { website: 'https://example.eth.limo.evil.test/' }), '');
});
test('ENS artwork and proposed contenthash reject unsafe schemes and malformed values', () => {
  assert.equal(ENS.imageUrl(`ipfs://${cid}/art.png`), `https://ipfs.io/ipfs/${cid}/art.png`);
  assert.equal(ENS.imageUrl('https://euc.li/decentcanopy.eth/h'), 'https://euc.li/decentcanopy.eth/h');
  assert.throws(() => ENS.imageUrl('javascript:alert(1)'), /HTTPS/);
  assert.throws(() => ENS.imageUrl('https://user:password@example.com/a'), /HTTPS/);
  assert.throws(() => ENS.imageUrl('ipfs://invalid/a'), /invalid/);
  assert.equal(ENS.contentUri(cid), `ipfs://${cid}`);
  assert.equal(ENS.contentUri(`ipfs://${cid}`), `ipfs://${cid}`);
  for (const invalid of ['invalid', `ipfs://${cid}/index.html`, `https://ipfs.io/ipfs/${cid}`]) assert.throws(() => ENS.contentUri(invalid), /root IPFS CID/);
});
test('weekly reminders trigger at the exact seven-day threshold', () => {
  const week = 7 * 86400000;
  assert.equal(ENS.due(100, 100 + week - 1), false);
  assert.equal(ENS.due(100, 100 + week), true);
  assert.equal(ENS.due(NaN), true);
});
test('latest site CID lookup bypasses stale CDN copies and rejects missing or invalid manifests', async () => {
  const uri = await ENS.latestCanopy(async (url, options) => {
    assert.equal(new URL(url).searchParams.get('t'), '1234');
    assert.equal(options.cache, 'no-store');
    return { ok: true, json: async () => ({ format: 'decentcanopy-site-pin', cid }) };
  }, 1234);
  assert.equal(uri, `ipfs://${cid}`);
  await assert.rejects(ENS.latestCanopy(async () => ({ ok: false, status: 503 })), /503/);
  await assert.rejects(ENS.latestCanopy(async () => ({ ok: true, json: async () => ({ cid }) })), /Invalid/);
});
test('ENS reads resolver records and handles missing resolvers and RPC errors explicitly', async () => {
  const resolver = {
    getAddress: async () => wallet, getContentHash: async () => `ipfs://${cid}`,
    getText: async key => key === 'avatar' ? 'https://euc.li/decentcanopy.eth' : 'https://euc.li/decentcanopy.eth/h',
  };
  const profile = await ENS.readProfile('decentcanopy.eth', { getResolver: async () => resolver });
  assert.equal(profile.avatar, 'https://euc.li/decentcanopy.eth');
  assert.equal(profile.header, 'https://euc.li/decentcanopy.eth/h');
  assert.equal(profile.address, wallet);
  assert.equal(profile.contenthash, `ipfs://${cid}`);
  await assert.rejects(ENS.readProfile('example.eth', { getResolver: async () => null }), /no resolver/);
  await assert.rejects(ENS.readProfile('example.eth', { getResolver: async () => { throw Error('RPC offline'); } }), /RPC offline/);
});
test('optional signed ENS fields preserve all existing signatures and are retained by project replacement', () => {
  const index = require('../data/decent-creators.json');
  for (const entry of index.creators) assert.deepEqual(Records.verify(entry, verifyMessage), entry.record);
  const original = index.creators.find(e => e.record.wallet === wallet).record;
  const project = original.projects.find(p => p.key === canopy.key);
  assert.equal('ens' in project, false);
  const updated = Records.replaceProject(original, { ...project, ens: 'DecentCanopy.eth' });
  assert.equal(updated.projects.find(p => p.key === canopy.key).ens, 'decentcanopy.eth');
  for (const p of original.projects.filter(p => p.key !== canopy.key)) assert.deepEqual(updated.projects.find(other => other.key === p.key), p);
  const blank = Records.replaceProject(original, { ...project, ens: '' });
  assert.deepEqual(blank, original);
  assert.throws(() => Records.replaceProject(original, { ...project, ens: 'https://example.eth/' }), /ASCII ENS/);
  assert.throws(() => Records.replaceProject(original, { ...project, ens: false }), /ENS name/);
  assert.equal(ENS.section(wallet, canopy, false, value => value).includes('data-ens-own="false"'), true);
  assert.equal(ENS.section(wallet, { key: 'none' }, false, value => value), '');
});
test('new ENS-bearing records round-trip through wallet signing and canonical verification', async () => {
  const signer = Wallet.createRandom();
  const base = require('../data/decent-creators.json').creators[0].record;
  const record = Records.validate({ ...base, version: 2, wallet: signer.address, revision: 1, previousCid: null,
    projects: [{ ...base.projects[0], ens: 'my-canopy.eth', related: [] }], funds: [], funding: [], journey: [] });
  const message = Records.message(record);
  const signature = await signer.signMessage(message);
  assert.deepEqual(Records.verify({ message, signature }, verifyMessage), record);
  assert.throws(() => Records.verify({ message: message.replace('my-canopy.eth', 'evil.eth'), signature }, verifyMessage), /authorize/);
});
