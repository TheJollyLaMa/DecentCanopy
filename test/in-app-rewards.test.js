'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { Wallet, verifyMessage } = require('../relay/node_modules/ethers');
const { buildRewardMessage, parseRewardMessage } = require('../scripts/reward-messages');
const { normalizeAirdropRequest, normalizePinnerRequest, registeredRecipient, requestIdFor } = require('../scripts/communityRewards');
const { processInAppRequest, verifySignedRequest } = require('../scripts/processInAppRequest');
const { createRelay } = require('../relay/server');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'community-rewards.json'), 'utf8'));
const NOW = new Date('2026-09-14T12:00:00Z');
const claimer = new Wallet('0x' + '11'.repeat(32));
const owner = new Wallet('0x' + '22'.repeat(32));
const stranger = new Wallet('0x' + '33'.repeat(32));
const ARTIZEN_WALLET = '0x5D9A2DAeEaAB5A87DF60ef3455FaeEA335bA916B';

async function signed(wallet, action, data, issuedAt = NOW.toISOString()) {
  const message = buildRewardMessage({ action, wallet: wallet.address, data, issuedAt });
  return { message, signature: await wallet.signMessage(message) };
}

const airdropData = (overrides = {}) => ({
  consent: true,
  artizenWallet: ARTIZEN_WALLET,
  name: 'Moss Maker',
  projects: ['https://artizen.fund/index/p/decent-canopy'],
  website: 'https://moss.example',
  location: { precision: 'none' },
  ...overrides,
});

function freshState() {
  return {
    config: { ...config, airdrop: { ...config.airdrop, enabled: true } },
    accounts: { contributors: [{ github: 'TheJollyLaMa', role: 'owner', walletAddress: owner.address }] },
    creators: { creators: [] },
    pinners: { pinners: [] },
    queue: { pending: [], paid: [] },
    requests: { version: 1, requests: [] },
    backup: { cid: 'bafytest', pinnedAt: '2026-09-13T00:00:00Z' },
  };
}

function fakeDeps(evidence = { verified: true, reason: 'Minted 900 ART via Artizen.' }) {
  const issues = [];
  return {
    issues,
    verifyMessage,
    verifyWallet: async () => evidence,
    checkGateway: async () => ({ ok: true, cid: 'bafytest' }),
    openIssue: async ({ title }) => {
      issues.push(title);
      return `TheJollyLaMa/DecentCanopy#${900 + issues.length}`;
    },
    commentAndClose: async () => {},
  };
}

test('reward messages round-trip and reject tampering', () => {
  const message = buildRewardMessage({ action: 'airdrop-claim', wallet: claimer.address, data: { consent: true }, issuedAt: NOW.toISOString(), nonce: 'a'.repeat(32) });
  const parsed = parseRewardMessage(message);
  assert.equal(parsed.action, 'airdrop-claim');
  assert.equal(parsed.wallet, claimer.address);
  assert.deepEqual(parsed.data, { consent: true });
  assert.throws(() => parseRewardMessage(message.replace('"consent":true', '"consent":false ')));
  assert.throws(() => parseRewardMessage(message.replace('airdrop-claim', 'reward-review')));
  assert.throws(() => parseRewardMessage('hello'));
});

test('normalizers require consent and clean the payload', () => {
  assert.throws(() => normalizeAirdropRequest(airdropData({ consent: false }), claimer.address), /consent/);
  assert.throws(() => normalizeAirdropRequest(airdropData({ website: 'javascript:alert(1)' }), claimer.address), /https/);
  const claim = normalizeAirdropRequest(airdropData({ website: '' }), claimer.address);
  assert.equal(claim.website, null);
  assert.equal(claim.connectedWallet, claimer.address);
  assert.equal(claim.projectLinks.length, 1);
  assert.throws(() => normalizePinnerRequest({ gateway: 'https://gw.example' }, claimer.address), /commitment/);
  assert.equal(normalizePinnerRequest({ commitment: true, gateway: 'https://gw.example/ipfs/' }, claimer.address).gateway, 'https://gw.example');
  assert.match(requestIdFor('0xABC'), /^[a-f0-9]{20}$/);
  assert.equal(requestIdFor('0xABC'), requestIdFor('0xabc'));
});

test('verifySignedRequest rejects a signature from another wallet and expired requests', async () => {
  const good = await signed(claimer, 'airdrop-claim', airdropData());
  assert.equal(verifySignedRequest(good, { verifyMessage, now: NOW }).signer, claimer.address.toLowerCase());
  const forged = { message: good.message, signature: await stranger.signMessage(good.message) };
  assert.throws(() => verifySignedRequest(forged, { verifyMessage, now: NOW }), /does not match/);
  const later = new Date(NOW.getTime() + 7 * 60 * 60 * 1000);
  assert.throws(() => verifySignedRequest(good, { verifyMessage, now: later }), /expired/);
});

test('verified in-app airdrop queues payroll under a public receipt issue', async () => {
  const state = freshState();
  const deps = fakeDeps();
  const payload = await signed(claimer, 'airdrop-claim', airdropData());
  const result = await processInAppRequest({ eventType: 'airdrop-claim', payload, state, deps, now: NOW });
  assert.equal(result.outcome, 'queued');
  assert.equal(deps.issues.length, 1);
  const [creator] = state.creators.creators;
  assert.equal(creator.github, null);
  assert.equal(creator.claimant, claimer.address.toLowerCase());
  assert.equal(creator.via, 'in-app');
  assert.equal(creator.claimIssue, 'TheJollyLaMa/DecentCanopy#901');
  const [entry] = state.queue.pending;
  assert.equal(entry.role, 'airdrop');
  assert.equal(entry.contributor, ARTIZEN_WALLET);
  assert.equal(entry.contributorGithub, claimer.address.toLowerCase());
  assert.equal(registeredRecipient(entry, state), ARTIZEN_WALLET);
  assert.equal(state.requests.requests[0].status, 'queued');

  const again = await processInAppRequest({ eventType: 'airdrop-claim', payload, state, deps, now: NOW });
  assert.equal(again.outcome, 'duplicate');
  const second = await processInAppRequest({ eventType: 'airdrop-claim', payload: await signed(claimer, 'airdrop-claim', airdropData()), state, deps, now: NOW });
  assert.equal(second.outcome, 'rejected');
  assert.equal(state.queue.pending.length, 1);
});

test('unverified airdrop waits for an owner-signed approval', async () => {
  const state = freshState();
  const deps = fakeDeps({ verified: false, reason: 'No ART minted through Artizen.' });
  const claim = await processInAppRequest({ eventType: 'airdrop-claim', payload: await signed(claimer, 'airdrop-claim', airdropData()), state, deps, now: NOW });
  assert.equal(claim.outcome, 'needs-review');
  assert.equal(deps.issues.length, 0);
  assert.equal(state.queue.pending.length, 0);

  const sneaky = await processInAppRequest({ eventType: 'reward-review', payload: await signed(stranger, 'reward-review', { requestId: claim.id, decision: 'approve' }), state, deps, now: NOW });
  assert.equal(sneaky.outcome, 'invalid');
  assert.equal(state.queue.pending.length, 0);

  const review = await processInAppRequest({ eventType: 'reward-review', payload: await signed(owner, 'reward-review', { requestId: claim.id, decision: 'approve', note: 'Known creator' }), state, deps, now: NOW });
  assert.equal(review.outcome, 'queued');
  assert.equal(state.queue.pending.length, 1);
  assert.equal(state.creators.creators[0].verification.method, 'owner-approved');
  const row = state.requests.requests.find(request => request.id === claim.id);
  assert.equal(row.status, 'queued');
  assert.equal(row.decidedBy, 'TheJollyLaMa');
});

test('in-app pinner requests need review and approval registers the wallet', async () => {
  const state = freshState();
  const deps = fakeDeps();
  const request = await processInAppRequest({ eventType: 'pinner-request', payload: await signed(claimer, 'pinner-request', { commitment: true, gateway: 'https://gw.example', setup: 'Pinata' }), state, deps, now: NOW });
  assert.equal(request.outcome, 'needs-review');
  assert.equal(request.gatewayCheck.ok, true);
  const duplicate = await processInAppRequest({ eventType: 'pinner-request', payload: await signed(claimer, 'pinner-request', { commitment: true, gateway: 'https://gw.example' }), state, deps, now: NOW });
  assert.equal(duplicate.outcome, 'rejected');

  const approval = await processInAppRequest({ eventType: 'reward-review', payload: await signed(owner, 'reward-review', { requestId: request.id, decision: 'approve' }), state, deps, now: NOW });
  assert.equal(approval.outcome, 'approved');
  const [pinner] = state.pinners.pinners;
  assert.equal(pinner.claimant, claimer.address.toLowerCase());
  assert.equal(pinner.wallet.toLowerCase(), claimer.address.toLowerCase());
  assert.equal(pinner.requestId, request.id);
  assert.equal(pinner.status, 'approved');
});

test('relay verifies, rate-limits, and dispatches signed requests', async () => {
  const calls = [];
  let clock = NOW.getTime();
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/dispatches')) return { status: 204, ok: true };
    if (url.includes('contributor-accounts.json')) return { ok: true, json: async () => ({ contributors: [{ role: 'owner', walletAddress: owner.address }] }) };
    if (url.includes('community-requests.json')) return { ok: true, json: async () => ({ requests: [{ id: 'a'.repeat(20), status: 'queued', message: 'secret', signature: '0x' }] }) };
    throw new Error(`unexpected ${url}`);
  };
  const relay = createRelay({ token: 't', repository: 'o/r', allowedOrigins: ['https://x.example'], verifyMessage, fetchImpl, now: () => clock });

  const good = await signed(claimer, 'pinner-request', { commitment: true, gateway: 'https://gw.example' });
  const accepted = await relay.submit(good, '1.1.1.1');
  assert.equal(accepted.status, 202);
  assert.equal(accepted.body.id, requestIdFor(good.signature));
  const dispatch = JSON.parse(calls.find(call => call.url.endsWith('/dispatches')).options.body);
  assert.equal(dispatch.event_type, 'pinner-request');
  assert.equal(dispatch.client_payload.signature, good.signature);

  assert.equal((await relay.submit(good, '1.1.1.1')).status, 409);
  assert.equal((await relay.submit({ message: good.message, signature: await stranger.signMessage(good.message) }, '1.1.1.1')).status, 401);
  assert.equal((await relay.submit(await signed(claimer, 'airdrop-claim', airdropData()), '1.1.1.1')).status, 410);
  assert.equal((await relay.submit(await signed(claimer, 'pinner-request', { commitment: false, gateway: 'https://gw.example' }), '1.1.1.1')).status, 400);
  assert.equal((await relay.submit(await signed(stranger, 'reward-review', { requestId: 'x', decision: 'approve' }), '1.1.1.1')).status, 403);
  assert.equal((await relay.submit(await signed(owner, 'reward-review', { requestId: 'a'.repeat(20), decision: 'reject' }), '1.1.1.1')).status, 202);

  clock += 60 * 60 * 1000;
  const stale = await signed(claimer, 'pinner-request', { commitment: true, gateway: 'https://gw.example' });
  assert.equal((await relay.submit(stale, '2.2.2.2')).status, 400);

  const status = await relay.status('a'.repeat(20));
  assert.equal(status.body.status, 'queued');
  assert.equal(status.body.message, undefined);
  assert.equal((await relay.status('../../etc')).status, 400);
});
