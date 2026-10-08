'use strict';

const { renderArtFiComment } = require('./commentArt');
const { githubRequest, postIssueComment, repositoryCoordinates } = require('./githubApi');
const { normalizeLogin } = require('./payroll');
const { acceptedCids, checkPinner } = require('./communityPinning');
const { ADDRESS_RE, PATHS, claimantOf, parsePinnerRequest, readJson, validClaimant, writeJson } = require('./communityRewards');

function evaluatePinnerApproval({ request, applicant, issueRef = null, requestId = null, pinners, now, approvedBy, via = 'github-issue' }) {
  const isWallet = ADDRESS_RE.test(String(applicant || ''));
  const github = isWallet ? String(applicant).toLowerCase() : normalizeLogin(applicant);
  if (!validClaimant(github)) return { status: 'rejected', reason: 'The request author is not a valid GitHub account or wallet.' };
  const rows = pinners.pinners || [];
  const existing = rows.find(row => claimantOf(row) === github.toLowerCase());
  if (existing) {
    const same = (issueRef && existing.issueRef === issueRef) || (requestId && existing.requestId === requestId);
    return same
      ? { status: 'already-approved', pinner: existing }
      : { status: 'rejected', reason: `${isWallet ? 'This wallet' : `@${github}`} is already a registered pinner (${existing.issueRef || 'in-app request'}).` };
  }
  const gateway = request.gateway.toLowerCase();
  if (rows.some(row => row.gateway.toLowerCase() === gateway)) return { status: 'rejected', reason: 'That gateway is already registered by another pinner.' };
  if (rows.some(row => row.wallet.toLowerCase() === request.wallet.toLowerCase())) return { status: 'rejected', reason: 'That reward wallet is already registered by another pinner.' };
  return {
    status: 'approved',
    pinner: {
      github: isWallet ? null : github,
      ...(isWallet ? { claimant: github } : {}),
      via,
      wallet: request.wallet,
      gateway: request.gateway,
      provider: request.provider,
      issueRef,
      ...(requestId ? { requestId } : {}),
      status: 'approved',
      approvedAt: now.toISOString(),
      approvedBy,
      weeksPassed: 0,
      lastCheck: null,
    },
  };
}

async function main() {
  const { owner, repo } = repositoryCoordinates();
  const event = readJson(process.env.GITHUB_EVENT_PATH);
  const issueNumber = Number(event.issue?.number);
  const issue = await githubRequest(`/repos/${owner}/${repo}/issues/${issueNumber}`);
  const config = readJson(PATHS.config).pinning;
  if (!(issue.labels || []).some(label => (label.name || label) === config.label) || issue.state !== 'open') return;

  const accounts = readJson(PATHS.accounts);
  const payrollOwner = (accounts.contributors || []).find(account => account.role === 'owner');
  const applicant = normalizeLogin(issue.user?.login);
  const actor = normalizeLogin(event.comment?.user?.login || event.sender?.login || applicant);
  const command = String(event.comment?.body || '').trim().split(/\s+/)[0];
  const isOwner = Boolean(payrollOwner && actor.toLowerCase() === String(payrollOwner.github).toLowerCase());
  const say = (message, type) => postIssueComment(owner, repo, issueNumber, renderArtFiComment(message, issueNumber, type));

  let request;
  try {
    request = parsePinnerRequest(issue.body);
  } catch (error) {
    await say(`⚠️ ${error.message}\n\nEdit the issue to fix it.`, 'pinner-invalid');
    return;
  }

  const manifest = readJson(PATHS.backup);
  const accepted = acceptedCids(manifest, { maxAgeDays: config.acceptedCidAgeDays });
  const result = accepted.length
    ? await checkPinner(request, accepted, { maxBytes: config.maxPayloadBytes })
    : { ok: false, reason: 'the canopy has not published an IPFS backup yet' };
  const checkLine = result.ok
    ? `✅ Your gateway served canopy backup \`${result.cid}\` with matching content (${result.ms} ms).`
    : `❌ Gateway check failed: ${result.reason}. Pin the latest CID${accepted[0] ? ` \`${accepted[0].cid}\`` : ''} and comment \`/pinner-recheck\`.`;

  if (command === '/pinner-approved') {
    if (!isOwner) {
      await say('⚠️ Only the repository owner can approve pinners.', 'pinner-rejected');
      return;
    }
    const pinners = readJson(PATHS.pinners);
    const decision = evaluatePinnerApproval({
      request, applicant, issueRef: `${owner}/${repo}#${issueNumber}`, pinners, now: new Date(), approvedBy: actor,
    });
    if (decision.status === 'rejected') {
      await say(`⚠️ ${decision.reason}`, 'pinner-rejected');
      return;
    }
    if (decision.status === 'already-approved') return;
    pinners.pinners.push(decision.pinner);
    writeJson(PATHS.pinners, pinners);
    await say([
      `📌 @${decision.pinner.github} is now a community pinner. Weekly checks queue **${config.amountPerWeek} ${config.currency}** to \`${decision.pinner.wallet}\` for each week your gateway serves the latest canopy backup.`,
      '',
      checkLine,
    ].join('\n'), 'pinner-approved');
    await githubRequest(`/repos/${owner}/${repo}/issues/${issueNumber}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: 'closed', state_reason: 'completed' }),
    }).catch(error => console.warn(`Could not close #${issueNumber}: ${error.message}`));
    return;
  }

  if (command === '/pinner-recheck' && !isOwner && actor.toLowerCase() !== applicant.toLowerCase()) return;
  await say(`${checkLine}\n\nThe maintainer approves new pinners with \`/pinner-approved\`; after that, rewards are checked and queued weekly.`, 'pinner-check');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = { evaluatePinnerApproval };
