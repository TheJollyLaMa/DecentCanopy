const fs = require('fs');
const path = require('path');

const { renderArtFiComment } = require('./commentArt');
const { postIssueComment, repositoryCoordinates } = require('./githubApi');
const { PAYROLL_ROLES, SUPPORTED_CURRENCIES, settleEntries } = require('./payroll');

const ROOT = path.resolve(__dirname, '..');
const QUEUE_PATH = path.join(ROOT, 'payroll-queue.json');
const ACCOUNTS_PATH = path.join(ROOT, 'contributor-accounts.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function buildSettlementComment({ settledCount, actor, txHash, issueNumber, currency, role }) {
  const body = [
    `✅ Settled ${settledCount} ${currency || 'ART'} ${role ? `${role} ` : ''}payroll entr${settledCount === 1 ? 'y' : 'ies'} by @${actor}.`,
    txHash ? `🔗 Tx: ${txHash}` : '',
  ].filter(Boolean).join('\n');
  return renderArtFiComment(body, issueNumber, 'settlement');
}

function validateSettlementInputs({ contributorGithub, issueRef, role, currency, txHash }) {
  if (!contributorGithub || !issueRef || !role || !currency || !txHash) {
    throw new Error('contributor, issue, role, currency, and confirmed transaction hash are all required');
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+#\d+$/.test(issueRef)) {
    throw new Error('issue_ref must look like owner/repo#123');
  }
  if (!PAYROLL_ROLES.has(role)) throw new Error(`unsupported payroll role: ${role}`);
  if (!SUPPORTED_CURRENCIES.includes(currency)) throw new Error(`unsupported payroll asset: ${currency}`);
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) throw new Error('tx_hash must be a 32-byte transaction hash');
}

async function main() {
  const { owner, repo } = repositoryCoordinates();
  const contributorGithub = String(process.env.INPUT_CONTRIBUTOR_GITHUB || '').trim();
  const issueRef = String(process.env.INPUT_ISSUE_REF || '').trim();
  const role = String(process.env.INPUT_ROLE || '').trim().toLowerCase();
  const currency = String(process.env.INPUT_CURRENCY || '').trim().toUpperCase();
  const txHash = String(process.env.INPUT_TX_HASH || '').trim();
  validateSettlementInputs({ contributorGithub, issueRef, role, currency, txHash });
  const queue = readJson(QUEUE_PATH);
  const accounts = readJson(ACCOUNTS_PATH);
  const settled = settleEntries({
    queue,
    accounts,
    contributorGithub,
    issueRef,
    role,
    currency,
    txHash,
    settledAt: new Date().toISOString(),
    settledBy: process.env.GITHUB_ACTOR || 'github-actions[bot]',
  });

  if (settled.length === 0) {
    throw new Error('No pending payroll entry matches the contributor, issue, role, and currency.');
  }
  writeJson(QUEUE_PATH, queue);
  writeJson(ACCOUNTS_PATH, accounts);

  const issueMatch = issueRef.match(/#(\d+)$/);
  if (issueMatch) {
    const issueNumber = Number(issueMatch[1]);
    await postIssueComment(owner, repo, issueNumber, buildSettlementComment({
      settledCount: settled.length,
      actor: process.env.GITHUB_ACTOR,
      txHash,
      issueNumber,
      currency,
      role,
    }));
  }
  console.log(`Settled ${settled.length} payroll entries.`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = { buildSettlementComment, validateSettlementInputs };