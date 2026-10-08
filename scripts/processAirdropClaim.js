'use strict';

const { renderArtFiComment } = require('./commentArt');
const { githubRequest, postIssueComment, repositoryCoordinates } = require('./githubApi');
const { applyAccountAccrual, isDuplicate, normalizeAmount, normalizeLogin, PAYROLL_ASSET_CONFIG } = require('./payroll');
const { verifyArtizenWallet } = require('./artizenOnchain');
const {
  PATHS,
  ADDRESS_RE,
  artizenSlug,
  claimantOf,
  communityCreatorId,
  parseAirdropClaim,
  readJson,
  validClaimant,
  writeJson,
} = require('./communityRewards');

const QUEUED_LABEL = 'airdrop-queued';
const REVIEW_LABEL = 'airdrop-needs-review';

/*
 * Pure decision step: given a parsed claim, its on-chain evidence, and the current registries,
 * return either a rejection reason or the creator record and payroll entry to add.
 */
function evaluateAirdropClaim({ claim, claimant, issueRef, evidence, creators, queue, config, now, queuedBy, ownerOverride = false, via = 'github-issue', requestId = null }) {
  const isWallet = ADDRESS_RE.test(String(claimant || ''));
  const github = isWallet ? String(claimant).toLowerCase() : normalizeLogin(claimant);
  if (!validClaimant(github)) return { status: 'rejected', reason: 'The claim author is not a valid GitHub account or wallet.' };
  const rows = creators.creators || [];
  const existing = rows.find(row => claimantOf(row) === github.toLowerCase());
  if (existing) {
    return existing.claimIssue === issueRef
      ? { status: 'already-claimed', creator: existing }
      : { status: 'rejected', reason: `${isWallet ? 'This wallet' : `@${github}`} already claimed the airdrop in ${existing.claimIssue}. One claim per ${isWallet ? 'wallet' : 'GitHub account'}.` };
  }
  const wallet = claim.artizenWallet.toLowerCase();
  const walletOwner = rows.find(row => row.artizenWallet.toLowerCase() === wallet
    || (row.connectedWallet && row.connectedWallet.toLowerCase() === wallet));
  if (walletOwner) return { status: 'rejected', reason: `That Artizen wallet is already linked to ${walletOwner.claimIssue}. One claim per wallet.` };
  if (claim.connectedWallet) {
    const connected = claim.connectedWallet.toLowerCase();
    const connectedOwner = rows.find(row => row.artizenWallet.toLowerCase() === connected
      || (row.connectedWallet && row.connectedWallet.toLowerCase() === connected));
    if (connectedOwner) return { status: 'rejected', reason: `That connected wallet is already linked to ${connectedOwner.claimIssue}. One claim per wallet.` };
  }
  if (!evidence.verified && !ownerOverride) return { status: 'needs-review', reason: evidence.reason };

  const verification = ownerOverride && !evidence.verified
    ? { ...evidence, method: 'owner-approved', verified: false }
    : evidence;
  const creator = {
    id: communityCreatorId(github),
    github: isWallet ? null : github,
    ...(isWallet ? { claimant: github } : {}),
    via,
    ...(requestId ? { requestId } : {}),
    name: claim.displayName || (isWallet ? `${github.slice(0, 6)}…${github.slice(-4)}` : github),
    artizenWallet: claim.artizenWallet,
    connectedWallet: claim.connectedWallet,
    artizenProjects: [...new Set(claim.projectLinks.map(artizenSlug).filter(Boolean))],
    website: claim.website,
    sharedLocation: claim.sharedLocation,
    verification,
    claimIssue: issueRef,
    joinedAt: now.toISOString(),
  };
  const entry = {
    issueRef,
    contributor: claim.artizenWallet,
    contributorGithub: github,
    amount: normalizeAmount(config.amount, config.currency),
    currency: config.currency,
    fund: PAYROLL_ASSET_CONFIG.fundSlug,
    role: 'airdrop',
    queuedAt: now.toISOString(),
    queuedBy,
  };
  if (isDuplicate(queue, entry)) return { status: 'already-claimed', creator };
  return { status: 'approved', creator, entry };
}

function comment(message, issueNumber, type) {
  return renderArtFiComment(message, issueNumber, type);
}

async function setLabels(owner, repo, issueNumber, add, remove) {
  try {
    await githubRequest(`/repos/${owner}/${repo}/issues/${issueNumber}/labels`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ labels: [add] }),
    });
    await githubRequest(`/repos/${owner}/${repo}/issues/${issueNumber}/labels/${encodeURIComponent(remove)}`, { method: 'DELETE' })
      .catch(() => {});
  } catch (error) {
    console.warn(`Could not update labels on #${issueNumber}: ${error.message}`);
  }
}

async function main() {
  if (readJson(PATHS.config).airdrop.enabled === false) {
    console.log('Artizen airdrop claims are retired; no changes made.');
    return;
  }
  const { owner, repo } = repositoryCoordinates();
  const event = readJson(process.env.GITHUB_EVENT_PATH);
  const issueNumber = Number(event.issue?.number);
  const issue = await githubRequest(`/repos/${owner}/${repo}/issues/${issueNumber}`);
  const config = readJson(PATHS.config).airdrop;
  if (!(issue.labels || []).some(label => (label.name || label) === config.label)) return;
  if (issue.state !== 'open') return;

  const accounts = readJson(PATHS.accounts);
  const payrollOwner = (accounts.contributors || []).find(account => account.role === 'owner');
  const claimant = normalizeLogin(issue.user?.login);
  const actor = normalizeLogin(event.comment?.user?.login || event.sender?.login || claimant);
  const command = String(event.comment?.body || '').trim().split(/\s+/)[0];
  const isOwner = Boolean(payrollOwner && actor.toLowerCase() === String(payrollOwner.github).toLowerCase());
  if (command === '/airdrop-approved' && !isOwner) {
    await postIssueComment(owner, repo, issueNumber, comment('⚠️ Only the repository owner can use `/airdrop-approved`.', issueNumber, 'airdrop-rejected'));
    return;
  }
  if (command === '/airdrop-recheck' && !isOwner && actor.toLowerCase() !== claimant.toLowerCase()) return;

  let claim;
  try {
    claim = parseAirdropClaim(issue.body);
  } catch (error) {
    await postIssueComment(owner, repo, issueNumber, comment(`⚠️ ${error.message}\n\nEdit the issue to fix it; the claim is checked again automatically.`, issueNumber, 'airdrop-invalid'));
    return;
  }

  let evidence;
  try {
    evidence = await verifyArtizenWallet(claim.artizenWallet, config.artizen);
  } catch (error) {
    await postIssueComment(owner, repo, issueNumber, comment(`⏳ Could not reach Base right now (${error.message}). Comment \`/airdrop-recheck\` to try again.`, issueNumber, 'airdrop-retry'));
    return;
  }

  const issueRef = `${owner}/${repo}#${issueNumber}`;
  const creators = readJson(PATHS.creators);
  const queue = readJson(PATHS.queue);
  const result = evaluateAirdropClaim({
    claim, claimant, issueRef, evidence, creators, queue, config,
    now: new Date(),
    queuedBy: isOwner && command === '/airdrop-approved' ? actor : 'airdrop-bot',
    ownerOverride: isOwner && command === '/airdrop-approved',
  });

  if (result.status === 'already-claimed') {
    console.log(`${issueRef} is already claimed.`);
    return;
  }
  if (result.status === 'rejected') {
    await postIssueComment(owner, repo, issueNumber, comment(`⚠️ ${result.reason}`, issueNumber, 'airdrop-rejected'));
    return;
  }
  if (result.status === 'needs-review') {
    await setLabels(owner, repo, issueNumber, REVIEW_LABEL, QUEUED_LABEL);
    await postIssueComment(owner, repo, issueNumber, comment([
      `🔎 We could not verify this Artizen wallet automatically: ${result.reason}`,
      '',
      `Automatic verification looks for at least ${config.artizen.minArtMinted} ART minted to the wallet by Artizen's Juicebox project on Base, which happens when you fund a project on Artizen.`,
      '- Double-check that you pasted your **Artizen** wallet (shown in your Artizen wallet panel), not a MetaMask address.',
      '- After funding a project on Artizen, comment `/airdrop-recheck`.',
      '- Or wait for the maintainer to review manually.',
    ].join('\n'), issueNumber, 'airdrop-review'));
    return;
  }

  creators.creators.push(result.creator);
  queue.pending.push(result.entry);
  applyAccountAccrual(accounts, [result.entry]);
  writeJson(PATHS.creators, creators);
  writeJson(PATHS.queue, queue);
  writeJson(PATHS.accounts, accounts);
  await setLabels(owner, repo, issueNumber, QUEUED_LABEL, REVIEW_LABEL);
  const evidenceLine = result.creator.verification.method === 'owner-approved'
    ? 'Approved by the maintainer.'
    : `Verified on Base: ${result.creator.verification.reason}`;
  await postIssueComment(owner, repo, issueNumber, comment([
    `🌳 Welcome to the canopy, @${result.creator.github}! Your creator blip is published and **${result.entry.amount} ${result.entry.currency}** is queued for your Artizen wallet \`${result.entry.contributor}\`.`,
    '',
    evidenceLine,
    'The payout is sent on Base when the maintainer settles the payroll queue.',
  ].join('\n'), issueNumber, 'airdrop-approved'));
  await githubRequest(`/repos/${owner}/${repo}/issues/${issueNumber}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: 'closed', state_reason: 'completed' }),
  }).catch(error => console.warn(`Could not close #${issueNumber}: ${error.message}`));
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = { evaluateAirdropClaim };
