const fs = require('fs');
const path = require('path');
const {
  PAYROLL_ASSET_CONFIG,
  PAYROLL_ROLES,
  SUPPORTED_CURRENCIES,
  normalizeAmount,
} = require('./payroll');

const ROOT = path.resolve(__dirname, '..');
const QUEUE_PATH = path.join(ROOT, 'payroll-queue.json');
const ACCOUNTS_PATH = path.join(ROOT, 'contributor-accounts.json');
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const ISSUE_REF_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+#\d+$/;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

if (!fs.existsSync(QUEUE_PATH)) fail('payroll-queue.json is missing');
if (!fs.existsSync(ACCOUNTS_PATH)) fail('contributor-accounts.json is missing');

let queue;
let accounts;
try { queue = readJson(QUEUE_PATH); } catch (error) { fail(`payroll-queue.json is not valid JSON: ${error.message}`); }
try { accounts = readJson(ACCOUNTS_PATH); } catch (error) { fail(`contributor-accounts.json is not valid JSON: ${error.message}`); }

if (!queue || typeof queue !== 'object' || Array.isArray(queue)) fail('payroll-queue.json must be a JSON object');
if (!Array.isArray(queue.pending)) fail('payroll-queue.json.pending must be an array');
if (!Array.isArray(queue.settled)) fail('payroll-queue.json.settled must be an array');
if (!accounts || typeof accounts !== 'object' || Array.isArray(accounts)) fail('contributor-accounts.json must be a JSON object');
if (!Array.isArray(accounts.contributors)) fail('contributor-accounts.json.contributors must be an array');

const contributors = new Map();
for (const [index, contributor] of accounts.contributors.entries()) {
  if (!contributor || typeof contributor !== 'object' || Array.isArray(contributor)) {
    fail(`contributor-accounts.json.contributors[${index}] must be an object`);
  }
  const github = String(contributor.github || '').trim();
  const wallet = String(contributor.walletAddress || '').trim();
  if (!github) fail(`contributor-accounts.json.contributors[${index}].github is required`);
  if (!ADDRESS_RE.test(wallet)) fail(`contributor-accounts.json.contributors[${index}].walletAddress must be a valid Ethereum address`);
  const githubKey = github.toLowerCase();
  if (contributors.has(githubKey)) fail(`duplicate contributor GitHub handle: ${github}`);
  contributors.set(githubKey, wallet.toLowerCase());
}

const seen = new Set();
function validateEntry(entry, section, index) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail(`${section}[${index}] must be an object`);
  const issueRef = String(entry.issueRef || '').trim();
  const contributorGithub = String(entry.contributorGithub || '').trim();
  const contributor = String(entry.contributor || '').trim();
  const amount = String(entry.amount || '').trim();
  const currency = String(entry.currency || 'ART').trim().toUpperCase();
  const role = String(entry.role || 'contributor').trim().toLowerCase();

  if (!ISSUE_REF_RE.test(issueRef)) fail(`${section}[${index}].issueRef must look like owner/repo#123`);
  if (!contributorGithub) fail(`${section}[${index}].contributorGithub is required`);
  if (!ADDRESS_RE.test(contributor)) fail(`${section}[${index}].contributor must be a valid Ethereum address`);
  if (!SUPPORTED_CURRENCIES.includes(currency)) fail(`${section}[${index}].currency is unsupported: ${currency}`);
  try {
    normalizeAmount(amount, currency);
  } catch (error) {
    fail(`${section}[${index}].amount is invalid for ${currency}: ${error.message}`);
  }
  if (!PAYROLL_ROLES.has(role)) fail(`${section}[${index}].role is not supported: ${role}`);
  if (entry.fund && String(entry.fund).trim().toLowerCase() !== PAYROLL_ASSET_CONFIG.fundSlug) {
    fail(`${section}[${index}].fund must be ${PAYROLL_ASSET_CONFIG.fundSlug}`);
  }

  const key = `${issueRef}:${contributorGithub.toLowerCase()}:${role}:${currency}`;
  if (seen.has(key)) fail(`duplicate payroll entry detected for ${issueRef} / ${contributorGithub}`);
  seen.add(key);
  const registeredWallet = contributors.get(contributorGithub.toLowerCase());
  if (!registeredWallet) fail(`${section}[${index}].contributorGithub is not registered in contributor-accounts.json`);
  if (registeredWallet !== contributor.toLowerCase()) fail(`${section}[${index}].contributor does not match the registered wallet for ${contributorGithub}`);

  if (section === 'settled') {
    if (!String(entry.settledAt || '').trim()) fail(`${section}[${index}].settledAt is required`);
    if (!String(entry.settledBy || '').trim()) fail(`${section}[${index}].settledBy is required`);
  } else {
    if (!String(entry.queuedAt || '').trim()) fail(`${section}[${index}].queuedAt is required`);
    if (!String(entry.queuedBy || '').trim()) fail(`${section}[${index}].queuedBy is required`);
  }
}

queue.pending.forEach((entry, index) => validateEntry(entry, 'pending', index));
queue.settled.forEach((entry, index) => validateEntry(entry, 'settled', index));
console.log(`✅ payroll queue validated (${queue.pending.length} pending, ${queue.settled.length} settled)`);