'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { Wallet, verifyMessage, parseUnits } = require('../relay/node_modules/ethers');
const Records = require('../scripts/creator-records');
const { publishCreator, pinRecord } = require('../scripts/publishCreator');
const { createRelay } = require('../relay/server');
const { buildRewardMessage } = require('../scripts/reward-messages');
const { processInAppRequest } = require('../scripts/processInAppRequest');
const { normalizeAmount } = require('../scripts/payroll');
const { DATA_FILES } = require('../scripts/pinDataBackup');
const { buildRewardEntries } = require('../scripts/checkCommunityPinners');
const { rewardablePinners } = require('../scripts/communityPinning');
const NOW = new Date('2026-10-08T12:00:00Z');
const owner = new Wallet('0x' + '44'.repeat(32)), stranger = new Wallet('0x' + '55'.repeat(32));
const CID = 'bafy' + 'a'.repeat(55), CID2 = 'bafy' + 'b'.repeat(55);
function record(overrides = {}) {
  return Records.validate({
    format: 'decentcanopy-creator', version: 1, consent: true, wallet: owner.address,
    revision: 1, previousCid: null, updatedAt: NOW.toISOString(), name: 'Forest Maker',
    bio: 'Building beyond one platform', website: 'https://forest.example', avatar: '', location: null,
    projects: [{ key: 'forest', name: 'Forest', description: 'A new chapter', website: '', image: '', status: 'active', archiveId: 'artizen-project:one' }],
    funding: [{ key: 'grant', name: 'Community grant', projectKey: 'forest', website: '', status: 'applied', amount: null, currency: '', asOf: '2026-10-08', note: '' }],
    journey: [{ key: 'update', date: '2026-10-08', projectKey: 'forest', type: 'progress', note: 'Made a prototype', evidence: '', payout: 'not-shared' }],
    ...overrides,
  });
}
async function signed(r = record(), signer = owner) {
  const message = Records.message(r);
  return { message, signature: await signer.signMessage(message) };
}
test('creator records are canonical, wallet-authorized and portable', async () => {
  const r = record(), envelope = await signed(r);
  assert.deepEqual(Records.verify(envelope, verifyMessage), r);
  assert.throws(() => Records.verify({ ...envelope, message: envelope.message.replace('Forest Maker', 'Not Forest Maker') }, verifyMessage), /authorize/);
  assert.throws(() => Records.parse(envelope.message + ' '), /canonical/);
  assert.throws(() => Records.verify({ ...envelope, signature: '0x' }, verifyMessage), /signature/);
  assert.throws(() => Records.verify(envelope, () => stranger.address), /authorize/);
});
test('consent, URLs, amounts, limits and dates are enforced', () => {
  assert.throws(() => record({ consent: false }), /consent/);
  assert.throws(() => record({ website: 'javascript:alert(1)' }), /HTTPS/);
  assert.throws(() => record({ avatar: 'https://user:password@example.org' }), /credentials/);
  assert.throws(() => record({ location: { label: 'Lisbon', precision: 'city', consent: false } }), /consent/);
  assert.throws(() => record({ projects: Array(21).fill(record().projects[0]) }), /20/);
  assert.throws(() => record({ projects: [{ ...record().projects[0], key: '"><img>' }] }), /keys/);
  assert.throws(() => record({ projects: [{ ...record().projects[0], archiveId: 'artizen-fund:one' }] }), /archived project/);
  assert.throws(() => record({ funding: [{ ...record().funding[0], amount: 10 }] }), /currency/);
  assert.throws(() => record({ journey: [{ ...record().journey[0], date: '2026-02-30' }] }), /valid date/);
  assert.throws(() => record({ journey: [{ ...record().journey[0], projectKey: 'missing' }] }), /missing project/);
});
test('Artizen experiences make no payout assertion unless explicitly selected', () => {
  const entry = { ...record().journey[0], type: 'artizen-experience' };
  assert.equal(record({ journey: [entry] }).journey[0].payout, 'not-shared');
  for (const payout of ['received', 'partially-received', 'not-received', 'uncertain', 'not-applicable']) {
    assert.equal(record({ journey: [{ ...entry, payout }] }).journey[0].payout, payout);
  }
});
test('publications pin before indexing, enforce version chain and retry idempotently', async () => {
  const index = { version: 1, creators: [] }, envelope = await signed();
  let pins = 0;
  const pin = async () => { pins++; return CID; };
  const args = { envelope, index, verifyMessage, pin, now: NOW };
  const first = await publishCreator(args);
  assert.equal(first.cid, CID); assert.equal(index.creators.length, 1);
  await publishCreator(args); assert.equal(pins, 1);
  const next = record({ revision: 2, previousCid: CID, bio: 'Next milestone' });
  await publishCreator({ ...args, envelope: await signed(next), pin: async () => CID2 });
  assert.equal(index.creators[0].cid, CID2);
  await assert.rejects(publishCreator(args), /newer published/);
  await assert.rejects(publishCreator({ ...args, envelope: await signed(record({ revision: 3, previousCid: CID })) }), /newer published/);
});
test('failed or unauthorized publications cannot change the public index', async () => {
  const index = { creators: [] }, args = { index, envelope: await signed(), verifyMessage, now: NOW };
  await assert.rejects(publishCreator({ ...args, pin: async () => { throw new Error('pin failed'); } }), /pin failed/);
  assert.equal(index.creators.length, 0);
  await assert.rejects(publishCreator({ ...args, envelope: await signed(record(), stranger), pin: async () => CID }), /authorize/);
  await assert.rejects(publishCreator({ ...args, pin: async () => 'invalid' }), /valid IPFS/);
  await assert.rejects(publishCreator({ ...args, archiveIds: new Set(), pin: async () => CID }), /frozen archive/);
  await assert.rejects(publishCreator({ ...args, now: new Date('2026-10-09'), pin: async () => CID }), /expired/);
  assert.equal(index.creators.length, 0);
  await assert.rejects(pinRecord({}, null), /PINATA_JWT/);
});
test('creator overlays leave the archive unchanged and do not imply fund membership', () => {
  const base = { projects: [{ id: 'artizen-project:one', kind: 'project', name: 'Historical project' }], associations: [], activity: [] };
  const before = JSON.stringify(base), r = record();
  const overlaid = Records.apply(base, [{ record: r, cid: CID }]);
  assert.equal(JSON.stringify(base), before);
  assert.equal(overlaid.projects.length, 4);
  assert.equal(overlaid.projects[0], base.projects[0]);
  assert.equal(overlaid.associations.find(e => e.type === 'research-link').target, 'artizen-project:one');
  assert.equal(overlaid.associations.some(e => ['fund-member', 'funded'].includes(e.type)), false);
  assert.equal(overlaid.projects.find(p => p.kind === 'fund').available, null);
  assert.equal(Records.apply(base, [{ record: r, draft: true }]).projects[1].creatorDraft, true);
});
test('relay verifies publications and exposes honest processing, error and published receipts', async () => {
  const calls = [], index = { version: 1, creators: [], publications: [] };
  const relay = createRelay({ token: 'test', repository: 'o/r', verifyMessage, now: () => NOW.getTime(), fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return url.endsWith('/dispatches') ? { status: 204 } : { ok: true, json: async () => index };
  } });
  const envelope = await signed(), response = await relay.submit(envelope, 'test-ip');
  assert.equal(response.status, 202);
  assert.equal(JSON.parse(calls.find(c => c.url.endsWith('/dispatches')).options.body).event_type, 'creator-publish');
  assert.equal((await relay.publicationStatus(response.body.id)).body.status, 'processing');
  index.publications.push({ id: response.body.id, status: 'error', reason: 'pin failed' });
  assert.equal((await relay.publicationStatus(response.body.id)).body.reason, 'pin failed');
  index.creators.push({ record: record(), ...envelope, cid: CID });
  assert.equal((await relay.submit(envelope, 'test-ip')).body.status, 'published');
  assert.equal((await relay.submit(await signed(record({ name: 'Forged' }), stranger), 'test-ip')).status, 400);
});
test('new pinning uses exactly 0.10 USDC and backups include signed profiles and freeze policy', () => {
  const config = require('../community-rewards.json');
  assert.equal(config.pinning.currency, 'USDC');
  assert.equal(normalizeAmount(config.pinning.amountPerWeek, 'USDC'), '0.1');
  assert.equal(config.pinning.maxRewardedPinnersPerWeek, 20);
  assert.equal(config.airdrop.enabled, false);
  for (const name of ['data/decent-creators.json', 'data/artizen-archive.json', 'community-rewards.json']) assert.ok(DATA_FILES.includes(name));
  assert.equal(require('../data/artizen-archive.json').frozen, true);
  const archive = require('../data/artizen-archive.json');
  const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  assert.equal(digest('data/artizen.json'), archive.snapshotSha256);
  assert.equal(digest('data/artizen-curation.json'), archive.curationSha256);
  assert.ok(!fs.readFileSync('index.html', 'utf8').includes('claim 100 ART'));
  assert.ok(!fs.readFileSync('index.html', 'utf8').includes('scripts/artizen-account.js'));
});
test('weekly qualifying pinners produce capped, exact USDC ledger entries and reject retired assets', () => {
  const config = require('../community-rewards.json').pinning, results = new Map();
  const pinners = Array.from({ length: 22 }, (_, i) => {
    const claimant = '0x' + (i + 1).toString(16).padStart(40, '0');
    results.set(claimant, { ok: true });
    return { claimant, wallet: claimant, status: 'approved', approvedAt: new Date(NOW.getTime() + i).toISOString() };
  });
  const rewarded = rewardablePinners(pinners, results, config.maxRewardedPinnersPerWeek);
  const args = { rewarded, config, issueRef: 'TheJollyLaMa/DecentCanopy#100', week: '2026-W41', now: NOW, queue: { pending: [], settled: [] } };
  const entries = buildRewardEntries(args);
  assert.equal(entries.length, 20);
  assert.ok(entries.every(entry => entry.currency === 'USDC' && entry.amount === '0.1' && entry.role === 'pinner'));
  assert.equal(entries.reduce((sum, entry) => sum + parseUnits(entry.amount, 6), 0n), 2000000n);
  assert.deepEqual(buildRewardEntries({ ...args, queue: { pending: entries, settled: [] } }), []);
  assert.throws(() => buildRewardEntries({ ...args, config: { ...config, currency: 'ART' } }), /must use USDC/);
});
test('retired airdrop requests cannot accrue new rewards', async () => {
  const message = buildRewardMessage({ action: 'airdrop-claim', wallet: owner.address, issuedAt: NOW.toISOString(), data: {} });
  const state = { config: require('../community-rewards.json'), accounts: { contributors: [] }, creators: { creators: [] }, pinners: { pinners: [] }, queue: { pending: [] }, requests: { requests: [] } };
  const result = await processInAppRequest({ eventType: 'airdrop-claim', payload: { message, signature: await owner.signMessage(message) }, state, deps: { verifyMessage }, now: NOW });
  assert.equal(result.outcome, 'rejected'); assert.equal(state.queue.pending.length, 0);
});
test('workflow entrypoint persists an explicit missing-pinning-secret error without changing profiles', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'decent-creator-main-'));
  try {
    fs.mkdirSync(path.join(temp, 'data'));
    fs.writeFileSync(path.join(temp, 'data/decent-creators.json'), JSON.stringify({ version: 1, creators: [] }));
    fs.writeFileSync(path.join(temp, 'data/artizen.json'), JSON.stringify({ projects: [] }));
    fs.writeFileSync(path.join(temp, 'data/artizen-curation.json'), JSON.stringify({ projects: [] }));
    const r = record({ projects: [], funding: [], journey: [], updatedAt: new Date().toISOString() });
    const envelope = await signed(r), eventPath = path.join(temp, 'event.json');
    fs.writeFileSync(eventPath, JSON.stringify({ action: 'creator-publish', client_payload: envelope }));
    const result = spawnSync(process.execPath, [path.resolve(__dirname, '../scripts/publishCreator.js')], {
      cwd: temp, encoding: 'utf8',
      env: { ...process.env, PINATA_JWT: '', GITHUB_EVENT_PATH: eventPath, NODE_PATH: path.resolve(__dirname, '../relay/node_modules') },
    });
    assert.equal(result.status, 0, result.stderr);
    const index = JSON.parse(fs.readFileSync(path.join(temp, 'data/decent-creators.json')));
    assert.equal(index.creators.length, 0);
    assert.equal(index.publications[0].status, 'error');
    assert.match(index.publications[0].reason, /PINATA_JWT/);
  } finally {
    for (const name of ['data/decent-creators.json', 'data/artizen.json', 'data/artizen-curation.json', 'event.json']) fs.unlinkSync(path.join(temp, name));
    fs.rmdirSync(path.join(temp, 'data'));
    fs.rmdirSync(temp);
  }
});
