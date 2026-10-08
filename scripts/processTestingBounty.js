const fs = require('fs');
const path = require('path');

const { renderArtFiComment } = require('./commentArt');
const { githubRequest, postIssueComment, repositoryCoordinates } = require('./githubApi');
const {
  TEST_BOUNTY_LABEL_RE,
  applyAccountAccrual,
  isDuplicate,
  normalizeLogin,
  parseAmountLabels,
  PAYROLL_ASSET_CONFIG,
  pickWhitelistedTester,
} = require('./payroll');

const ROOT = path.resolve(__dirname, '..');
const QUEUE_PATH = path.join(ROOT, 'payroll-queue.json');
const ACCOUNTS_PATH = path.join(ROOT, 'contributor-accounts.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function buildTestingComment(message, issueNumber, commentType) {
  return renderArtFiComment(message, issueNumber, commentType);
}

async function main() {
  const { owner, repo } = repositoryCoordinates();
  const event = readJson(process.env.GITHUB_EVENT_PATH);
  const comment = String(event.comment && event.comment.body || '').trim();
  const commenter = normalizeLogin(event.comment && event.comment.user && event.comment.user.login);
  const issueNumber = Number(event.issue && event.issue.number);
  const issue = await githubRequest(`/repos/${owner}/${repo}/issues/${issueNumber}`);
  const parsedBounties = parseAmountLabels(issue, TEST_BOUNTY_LABEL_RE);
  const rewardCurrencies = require('../payroll-assets.json').newRewardCurrencies;
  const bounties = parsedBounties.filter(bounty => rewardCurrencies.includes(bounty.currency));
  if (bounties.length !== parsedBounties.length) console.warn(`Issue #${issueNumber}: retired-currency rewards were not queued. New rewards must use USDC.`);

  if (bounties.length === 0) {
    console.log('Issue #' + issueNumber + ' has no test-bounty label for a configured payroll asset.');
    return;
  }

  const assigneeLogins = (issue.assignees || []).map(assignee => normalizeLogin(assignee.login));
  if (comment.startsWith('/test-complete')) {
    if (!assigneeLogins.some(login => login.toLowerCase() === commenter.toLowerCase())) {
      await postIssueComment(owner, repo, issueNumber, buildTestingComment('⚠️ Only assigned testers can use `/test-complete`.', issueNumber, 'test-rejected'));
      return;
    }
    await postIssueComment(owner, repo, issueNumber, buildTestingComment(
      `✅ Thanks @${commenter} — your testing work has been noted. Awaiting \`/test-approved\` from the maintainer.`,
      issueNumber,
      'test-complete'
    ));
    return;
  }

  if (!comment.startsWith('/test-approved')) return;
  const queue = readJson(QUEUE_PATH);
  const accounts = readJson(ACCOUNTS_PATH);
  if (!Array.isArray(queue.pending)) queue.pending = [];
  if (!Array.isArray(queue.settled)) queue.settled = [];
  if (!Array.isArray(accounts.contributors)) accounts.contributors = [];
  const payrollOwner = accounts.contributors.find(account => account.role === 'owner');
  if (!payrollOwner || commenter.toLowerCase() !== String(payrollOwner.github).toLowerCase()) {
    await postIssueComment(owner, repo, issueNumber, buildTestingComment('⚠️ Only the repository owner can approve testing payouts.', issueNumber, 'test-rejected'));
    return;
  }

  const tester = pickWhitelistedTester({ assigneeLogins, accounts, commenter });
  const entries = bounties.map(bounty => ({
    issueRef: `${owner}/${repo}#${issueNumber}`,
    contributor: tester.walletAddress,
    contributorGithub: tester.github,
    amount: bounty.amount,
    currency: bounty.currency,
    fund: PAYROLL_ASSET_CONFIG.fundSlug,
    role: 'tester',
    queuedAt: new Date().toISOString(),
    queuedBy: process.env.GITHUB_ACTOR || commenter,
  })).filter(entry => !isDuplicate(queue, entry));
  if (entries.length === 0) {
    console.log(`Testing payouts already exist for ${owner}/${repo}#${issueNumber} / @${tester.github}.`);
    return;
  }

  queue.pending.push(...entries);
  applyAccountAccrual(accounts, entries);
  writeJson(QUEUE_PATH, queue);
  writeJson(ACCOUNTS_PATH, accounts);
  await postIssueComment(owner, repo, issueNumber, buildTestingComment(
    `✅ Queued ${entries.map(entry => `${entry.amount} ${entry.currency}`).join(' and ')} testing bounty for @${tester.github}, pending administrator settlement.`,
    issueNumber,
    'test-approved'
  ));
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = { buildTestingComment };