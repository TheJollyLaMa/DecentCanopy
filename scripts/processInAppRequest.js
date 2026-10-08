'use strict';

/*
 * Processes in-app reward requests delivered by the relay as repository_dispatch events.
 * The relay already verified the wallet signature; this script verifies it again so that the
 * dispatch token alone cannot queue payroll entries. Payroll entries still reference a public
 * GitHub issue (opened by the bot) so settlement and on-chain replay protection are unchanged.
 */

const { renderArtFiComment } = require('./commentArt');
const { githubRequest, repositoryCoordinates } = require('./githubApi');
const { applyAccountAccrual } = require('./payroll');
const { verifyArtizenWallet } = require('./artizenOnchain');
const { acceptedCids, checkPinner } = require('./communityPinning');
const { evaluateAirdropClaim } = require('./processAirdropClaim');
const { evaluatePinnerApproval } = require('./processPinnerRequest');
const { parseRewardMessage } = require('./reward-messages');
const {
  PATHS,
  normalizeAirdropRequest,
  normalizePinnerRequest,
  readJson,
  requestIdFor,
  writeJson,
} = require('./communityRewards');

const MAX_REQUEST_AGE_MS = 6 * 60 * 60 * 1000;
const MAX_OPEN_REVIEWS = 50;
const KEEP_CLOSED_REQUESTS = 500;

function verifySignedRequest({ message, signature }, { verifyMessage, now = new Date(), maxAgeMs = MAX_REQUEST_AGE_MS }) {
  const parsed = parseRewardMessage(message);
  if (!/^0x[a-fA-F0-9]{130}$/.test(String(signature || ''))) throw new Error('The signature is not a 65-byte hex string.');
  const recovered = verifyMessage(message, signature);
  if (String(recovered).toLowerCase() !== parsed.wallet.toLowerCase()) throw new Error('The signature does not match the wallet in the message.');
  const age = now.getTime() - Date.parse(parsed.issuedAt);
  if (age > maxAgeMs || age < -10 * 60 * 1000) throw new Error('The signed request has expired; please sign again.');
  return { ...parsed, signer: parsed.wallet.toLowerCase(), id: requestIdFor(signature) };
}

function summaryFor(type, claim) {
  return type === 'airdrop'
    ? { name: claim.displayName, artizenWallet: claim.artizenWallet, projects: claim.projectLinks.length, website: claim.website }
    : { gateway: claim.gateway, provider: claim.provider };
}

function upsertRequest(requests, record) {
  const rows = requests.requests;
  const index = rows.findIndex(row => row.id === record.id);
  if (index >= 0) rows[index] = { ...rows[index], ...record };
  else rows.unshift(record);
  const open = rows.filter(row => row.status === 'needs-review');
  const closed = rows.filter(row => row.status !== 'needs-review').slice(0, KEEP_CLOSED_REQUESTS);
  requests.requests = [...open, ...closed].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  requests.updatedAt = record.updatedAt;
}

/*
 * Pure orchestration with injected side effects (GitHub issues, Base lookups, gateway checks),
 * so the full in-app flow can be exercised in tests without the network.
 */
async function processInAppRequest({ eventType, payload, state, deps, now = new Date() }) {
  const { verifyMessage, verifyWallet, checkGateway, openIssue, commentAndClose } = deps;
  const { config, accounts, creators, pinners, queue, requests, backup, repoSlug } = state;
  const stamp = now.toISOString();
  const owner = (accounts.contributors || []).find(account => account.role === 'owner');

  let request;
  try {
    request = verifySignedRequest(payload, { verifyMessage, now });
  } catch (error) {
    return { outcome: 'invalid', reason: error.message };
  }
  if (request.action !== eventType) return { outcome: 'invalid', reason: `Event ${eventType} does not match signed action ${request.action}.` };
  if (requests.requests.some(row => row.id === request.id)) return { outcome: 'duplicate', id: request.id };
  const base = { id: request.id, signer: request.signer, createdAt: stamp, updatedAt: stamp, message: payload.message, signature: payload.signature };
  const record = fields => { upsertRequest(requests, { ...base, ...fields }); return { outcome: fields.status, id: request.id, ...fields }; };

  if (request.action === 'airdrop-claim') {
    if (config.airdrop.enabled === false) return record({ type: 'airdrop', status: 'rejected', reason: 'Artizen airdrop claims are retired. Use a Decent Creator profile instead.' });
    let claim;
    try {
      claim = normalizeAirdropRequest(request.data, request.signer);
    } catch (error) {
      return record({ type: 'airdrop', status: 'rejected', reason: error.message });
    }
    const summary = summaryFor('airdrop', claim);
    let evidence;
    try {
      evidence = await verifyWallet(claim.artizenWallet, config.airdrop.artizen);
    } catch (error) {
      return record({ type: 'airdrop', status: 'error', reason: `Could not reach Base (${error.message}). Please try again in a few minutes.`, summary });
    }
    const common = { claim, claimant: request.signer, evidence, creators, queue, config: config.airdrop, now, queuedBy: 'in-app-airdrop-bot', via: 'in-app', requestId: request.id };
    const precheck = evaluateAirdropClaim({ ...common, issueRef: `in-app:${request.id}` });
    if (precheck.status === 'rejected' || precheck.status === 'already-claimed') {
      return record({ type: 'airdrop', status: 'rejected', reason: precheck.reason || 'This wallet already joined the canopy.', summary });
    }
    if (precheck.status === 'needs-review') {
      if (requests.requests.filter(row => row.status === 'needs-review').length >= MAX_OPEN_REVIEWS) {
        return record({ type: 'airdrop', status: 'rejected', reason: 'The review queue is full right now. Please try again later.', summary });
      }
      return record({ type: 'airdrop', status: 'needs-review', reason: precheck.reason, summary, evidence });
    }
    const issueRef = await openIssue({ title: `🎁 In-app airdrop: ${claim.displayName || request.signer}`, body: airdropIssueBody(request, claim, evidence, payload), labels: ['in-app-reward', 'airdrop-queued'] });
    const result = evaluateAirdropClaim({ ...common, issueRef });
    creators.creators.push(result.creator);
    queue.pending.push(result.entry);
    applyAccountAccrual(accounts, [result.entry]);
    await commentAndClose(issueRef, `🌳 Welcome to the canopy! ${result.entry.amount} ${result.entry.currency} is queued for Artizen wallet \`${result.entry.contributor}\`. ${evidence.reason || ''}`, 'completed');
    return record({ type: 'airdrop', status: 'queued', reason: evidence.reason || null, summary, issueRef, amount: result.entry.amount, currency: result.entry.currency });
  }

  if (request.action === 'pinner-request') {
    let pin;
    try {
      pin = normalizePinnerRequest(request.data, request.signer);
    } catch (error) {
      return record({ type: 'pinner', status: 'rejected', reason: error.message });
    }
    const summary = summaryFor('pinner', pin);
    const precheck = evaluatePinnerApproval({ request: pin, applicant: request.signer, requestId: request.id, pinners, now, approvedBy: 'precheck', via: 'in-app' });
    if (precheck.status !== 'approved') return record({ type: 'pinner', status: 'rejected', reason: precheck.reason || 'This wallet is already a pinner.', summary });
    if (requests.requests.some(row => row.type === 'pinner' && row.status === 'needs-review' && row.signer === request.signer)) {
      return record({ type: 'pinner', status: 'rejected', reason: 'This wallet already has a pinner request awaiting review.', summary });
    }
    if (requests.requests.filter(row => row.status === 'needs-review').length >= MAX_OPEN_REVIEWS) {
      return record({ type: 'pinner', status: 'rejected', reason: 'The review queue is full right now. Please try again later.', summary });
    }
    const accepted = acceptedCids(backup, { now, maxAgeDays: config.pinning.acceptedCidAgeDays });
    const check = accepted.length
      ? await checkGateway(pin, accepted, { maxBytes: config.pinning.maxPayloadBytes })
      : { ok: false, reason: 'the canopy has not published an IPFS backup yet' };
    return record({ type: 'pinner', status: 'needs-review', reason: 'Awaiting maintainer approval.', summary, gatewayCheck: { ok: check.ok, cid: check.cid || null, reason: check.ok ? null : check.reason, checkedAt: stamp } });
  }

  // reward-review: the owner wallet approves or rejects a request that needs review.
  if (!owner?.walletAddress || owner.walletAddress.toLowerCase() !== request.signer) {
    return { outcome: 'invalid', reason: 'Only the registered owner wallet can review reward requests.' };
  }
  const decision = String(request.data.decision || '');
  const target = requests.requests.find(row => row.id === String(request.data.requestId || ''));
  if (!target || target.status !== 'needs-review') return { outcome: 'invalid', reason: 'That request is not awaiting review.' };
  if (!['approve', 'reject'].includes(decision)) return { outcome: 'invalid', reason: 'Decision must be approve or reject.' };
  const note = String(request.data.note || '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 200);
  const decided = fields => {
    upsertRequest(requests, { ...target, ...fields, updatedAt: stamp, decidedBy: owner.github, decidedAt: stamp, reviewSignature: payload.signature });
    return { outcome: fields.status, id: target.id, ...fields };
  };
  if (decision === 'reject') return decided({ status: 'rejected', reason: note || 'Declined by the maintainer.' });
  if (target.type === 'airdrop' && config.airdrop.enabled === false) return decided({ status: 'rejected', reason: 'Artizen airdrop claims are retired.' });

  const original = verifySignedRequest({ message: target.message, signature: target.signature }, { verifyMessage, now, maxAgeMs: Infinity });
  if (target.type === 'pinner') {
    const pin = normalizePinnerRequest(original.data, original.signer);
    const result = evaluatePinnerApproval({ request: pin, applicant: original.signer, requestId: target.id, pinners, now, approvedBy: owner.github, via: 'in-app' });
    if (result.status === 'rejected') return decided({ status: 'rejected', reason: result.reason });
    if (result.status === 'approved') pinners.pinners.push(result.pinner);
    return decided({ status: 'approved', reason: note || 'Approved by the maintainer.' });
  }

  const claim = normalizeAirdropRequest(original.data, original.signer);
  let evidence;
  try {
    evidence = await verifyWallet(claim.artizenWallet, config.airdrop.artizen);
  } catch (error) {
    evidence = { verified: false, method: 'base-art-mint', reason: `Base lookup failed during review (${error.message}).` };
  }
  const common = { claim, claimant: original.signer, evidence, creators, queue, config: config.airdrop, now, queuedBy: owner.github, ownerOverride: true, via: 'in-app', requestId: target.id };
  const precheck = evaluateAirdropClaim({ ...common, issueRef: `in-app:${target.id}` });
  if (precheck.status === 'rejected' || precheck.status === 'already-claimed') return decided({ status: 'rejected', reason: precheck.reason || 'Already claimed.' });
  const issueRef = await openIssue({ title: `🎁 In-app airdrop (maintainer-approved): ${claim.displayName || original.signer}`, body: airdropIssueBody(original, claim, evidence, { message: target.message, signature: target.signature }, owner.github), labels: ['in-app-reward', 'airdrop-queued'] });
  const result = evaluateAirdropClaim({ ...common, issueRef });
  creators.creators.push(result.creator);
  queue.pending.push(result.entry);
  applyAccountAccrual(accounts, [result.entry]);
  await commentAndClose(issueRef, `🤝 Approved by the maintainer. ${result.entry.amount} ${result.entry.currency} is queued for \`${result.entry.contributor}\`.`, 'completed');
  return decided({ status: 'queued', reason: note || 'Approved by the maintainer.', issueRef, amount: result.entry.amount, currency: result.entry.currency });
}

function airdropIssueBody(request, claim, evidence, payload, approvedBy = null) {
  return [
    'Public record of an in-app airdrop claim, signed with the claimant\'s wallet (no GitHub account needed).',
    '',
    `- **Signing wallet:** \`${request.signer || request.wallet}\``,
    `- **Artizen wallet (payout):** \`${claim.artizenWallet}\``,
    `- **Creator name:** ${claim.displayName || '—'}`,
    `- **Verification:** ${evidence.verified ? `✅ ${evidence.reason}` : `🤝 approved by @${approvedBy} (${evidence.reason || 'manual review'})`}`,
    '',
    '<details><summary>Signed message and signature</summary>',
    '',
    '```text',
    payload.message,
    '```',
    '',
    `Signature: \`${payload.signature}\``,
    '',
    '</details>',
  ].join('\n');
}

async function main() {
  const { owner, repo } = repositoryCoordinates();
  const event = readJson(process.env.GITHUB_EVENT_PATH);
  const { verifyMessage } = require('ethers');
  const state = {
    config: readJson(PATHS.config),
    accounts: readJson(PATHS.accounts),
    creators: readJson(PATHS.creators),
    pinners: readJson(PATHS.pinners),
    queue: readJson(PATHS.queue),
    requests: readJson(PATHS.requests),
    backup: readJson(PATHS.backup),
  };
  const deps = {
    verifyMessage,
    verifyWallet: verifyArtizenWallet,
    checkGateway: checkPinner,
    async openIssue({ title, body, labels }) {
      const create = payload => githubRequest(`/repos/${owner}/${repo}/issues`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const issue = await create({ title, body, labels }).catch(error => {
        console.warn(`Creating the receipt issue with labels failed (${error.message}); retrying without labels.`);
        return create({ title, body });
      });
      return `${owner}/${repo}#${issue.number}`;
    },
    async commentAndClose(issueRef, message, reason) {
      const number = Number(issueRef.split('#')[1]);
      await githubRequest(`/repos/${owner}/${repo}/issues/${number}/comments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: renderArtFiComment(message, number, 'in-app-reward') }),
      }).catch(error => console.warn(`Could not comment on ${issueRef}: ${error.message}`));
      await githubRequest(`/repos/${owner}/${repo}/issues/${number}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: 'closed', state_reason: reason }),
      }).catch(error => console.warn(`Could not close ${issueRef}: ${error.message}`));
    },
  };
  const result = await processInAppRequest({ eventType: event.action, payload: event.client_payload || {}, state, deps });
  console.log(`In-app ${event.action}: ${result.outcome}${result.reason ? ` — ${result.reason}` : ''}`);
  if (['invalid', 'duplicate'].includes(result.outcome)) return;
  writeJson(PATHS.requests, state.requests);
  writeJson(PATHS.creators, state.creators);
  writeJson(PATHS.pinners, state.pinners);
  writeJson(PATHS.queue, state.queue);
  writeJson(PATHS.accounts, state.accounts);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = { processInAppRequest, verifySignedRequest };
