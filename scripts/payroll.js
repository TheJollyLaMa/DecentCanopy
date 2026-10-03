const PAYROLL_ASSET_CONFIG = require('../payroll-assets.json');
const SUPPORTED_CURRENCIES = Object.keys(PAYROLL_ASSET_CONFIG.assets || {});
const BOUNTY_LABEL_RE = /^bounty:\s*((?:0|[1-9]\d*)(?:\.\d+)?)\s*\$?([A-Za-z][A-Za-z0-9]{0,9})$/i;
const TEST_BOUNTY_LABEL_RE = /^test-bounty:\s*((?:0|[1-9]\d*)(?:\.\d+)?)\s*\$?([A-Za-z][A-Za-z0-9]{0,9})$/i;
const IDEA_CREDIT_LABEL_RE = /^idea-credit:\s*@?([-\w]+)$/i;
const CLOSING_ISSUE_RE = /(?:closes?|fixes?|resolves?)\s+(?:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)?#(\d+)/gi;
const TITLE_ISSUE_RE = /#(\d+)/g;
const AMOUNT_RE = /^\d+(?:\.\d+)?$/;
const PAYROLL_ROLES = new Set(['contributor', 'implementer', 'idea-originator', 'tester', 'airdrop', 'pinner']);

const CONTRIBUTOR_ALIASES = {
  'copilot-swe-agent': 'copilot',
  'copilot-swe-agent[bot]': 'copilot',
};

function normalizeLogin(login) {
  const value = String(login || '').trim();
  return CONTRIBUTOR_ALIASES[value.toLowerCase()] || value;
}

function labelNames(issue) {
  return (issue.labels || []).map(label => typeof label === 'string' ? label : label.name);
}

function normalizeCurrency(currency = 'ART') {
  const value = String(currency || 'ART').trim().toUpperCase();
  if (!SUPPORTED_CURRENCIES.includes(value)) throw new Error(`Unsupported payroll currency: ${currency}`);
  return value;
}

function currencyDecimals(currency = 'ART') {
  const asset = PAYROLL_ASSET_CONFIG.assets[normalizeCurrency(currency)];
  return asset.ledgerDecimals;
}

function normalizeAmount(value, currency = 'ART') {
  const input = String(value).trim();
  if (!AMOUNT_RE.test(input)) throw new Error(`Invalid payout amount: ${value}`);
  const [rawWhole, rawFraction = ''] = input.split('.');
  if (rawFraction.length > currencyDecimals(currency)) {
    throw new Error(`${normalizeCurrency(currency)} payouts support at most ${currencyDecimals(currency)} decimal places: ${value}`);
  }
  const whole = rawWhole.replace(/^0+(?=\d)/, '');
  const fraction = rawFraction.replace(/0+$/, '');
  if (BigInt(`${whole}${rawFraction}` || '0') <= 0n) throw new Error(`Invalid payout amount: ${value}`);
  return fraction ? `${whole}.${fraction}` : whole;
}

function parseAmountLabels(issue, pattern = BOUNTY_LABEL_RE) {
  const byCurrency = new Map();
  for (const label of labelNames(issue)) {
    const match = String(label || '').match(pattern);
    if (!match) continue;
    if (Number(match[1]) <= 0) continue;
    const currency = String(match[2] || 'ART').toUpperCase();
    if (!SUPPORTED_CURRENCIES.includes(currency)) continue;
    if (byCurrency.has(currency)) throw new Error(`Issue has more than one ${currency} bounty label`);
    byCurrency.set(currency, { label, amount: normalizeAmount(match[1], currency), currency });
  }
  return [...byCurrency.values()];
}

function parseAmountLabel(issue, pattern = BOUNTY_LABEL_RE) {
  return parseAmountLabels(issue, pattern)[0] || null;
}

function parseIdeaCredit(issue) {
  for (const label of labelNames(issue)) {
    const match = String(label || '').match(IDEA_CREDIT_LABEL_RE);
    if (match) return normalizeLogin(match[1]);
  }
  return null;
}

function extractIssueNumbers({ body = '', title = '', linked = [], override = [] } = {}) {
  const numbers = new Set();
  for (const value of override) {
    const number = Number(value);
    if (Number.isInteger(number) && number > 0) numbers.add(number);
  }
  for (const match of String(body).matchAll(CLOSING_ISSUE_RE)) numbers.add(Number(match[1]));
  for (const match of String(title).matchAll(TITLE_ISSUE_RE)) numbers.add(Number(match[1]));
  for (const value of linked) {
    const number = Number(value);
    if (Number.isInteger(number) && number > 0) numbers.add(number);
  }
  return [...numbers];
}

function decimalUnits(value, currency) {
  const normalized = normalizeAmount(value, currency);
  const [whole, fraction = ''] = normalized.split('.');
  const scale = currencyDecimals(currency);
  return BigInt(`${whole}${fraction.padEnd(scale, '0')}`);
}

function formatUnits(units, currency) {
  const scale = currencyDecimals(currency);
  const digits = units.toString().padStart(scale + 1, '0');
  if (scale === 0) return digits;
  const fraction = digits.slice(-scale).replace(/0+$/, '');
  return fraction ? `${digits.slice(0, -scale)}.${fraction}` : digits.slice(0, -scale);
}

function splitIdeaCredit(amount, currency = 'ART') {
  const value = normalizeCurrency(currency);
  const units = decimalUnits(amount, value);
  if (units % 5n !== 0n) {
    throw new Error(`Payout amount cannot be split exactly at ${currencyDecimals(value)} decimals: ${amount} ${value}`);
  }
  const originatorUnits = units / 5n;
  return {
    implementer: formatUnits(units - originatorUnits, value),
    originator: formatUnits(originatorUnits, value),
  };
}

function findAccount(accounts, login) {
  const normalized = normalizeLogin(login).toLowerCase();
  return (accounts.contributors || []).find(
    account => String(account.github || '').trim().toLowerCase() === normalized
  );
}

function requireWhitelistedAccount(accounts, candidates, description) {
  for (const login of candidates) {
    const account = findAccount(accounts, login);
    if (account && String(account.walletAddress || '').trim()) return account;
  }
  throw new Error(`No whitelisted wallet found for ${description}: ${candidates.filter(Boolean).join(', ') || 'none'}`);
}

function entryRole(entry) {
  return String(entry.role || 'contributor').toLowerCase();
}

function entryCurrency(entry) {
  return normalizeCurrency(entry.currency);
}

function balanceFields(currency = 'ART') {
  const prefix = normalizeCurrency(currency).toLowerCase();
  return { pending: `${prefix}Pending`, earned: `${prefix}Earned` };
}

function isDuplicate(queue, candidate) {
  const issueRef = String(candidate.issueRef || '').trim();
  const contributorGithub = String(candidate.contributorGithub || '').trim().toLowerCase();
  const candidateRole = entryRole(candidate);
  const currency = entryCurrency(candidate);

  return [...(queue.pending || []), ...(queue.settled || [])].some(entry =>
    String(entry.issueRef || '').trim() === issueRef &&
    String(entry.contributorGithub || '').trim().toLowerCase() === contributorGithub &&
    entryRole(entry) === candidateRole &&
    entryCurrency(entry) === currency
  );
}

function pickWhitelistedTester({ assigneeLogins = [], accounts, commenter = '' } = {}) {
  const eligible = assigneeLogins
    .map(login => normalizeLogin(login))
    .filter(Boolean)
    .map(login => findAccount(accounts, login))
    .filter(account => account && String(account.walletAddress || '').trim());

  if (eligible.length === 0) throw new Error('No assigned tester has a whitelisted wallet.');
  const commenterKey = normalizeLogin(commenter).toLowerCase();
  const commenterMatch = eligible.find(
    account => String(account.github || '').trim().toLowerCase() === commenterKey
  );
  if (commenterMatch) return commenterMatch;
  if (eligible.length > 1) {
    throw new Error(`Multiple assigned testers have whitelisted wallets: ${eligible.map(account => account.github).join(', ')}`);
  }
  return eligible[0];
}

function createBountyEntries({ issue, pr, accounts, queue, repoSlug, queuedAt, queuedBy }) {
  const bounties = parseAmountLabels(issue);
  if (!bounties.length) return { entries: [], reason: 'missing-bounty-label' };

  const prAuthor = normalizeLogin(pr.user && pr.user.login);
  const assignees = (issue.assignees || []).map(assignee => normalizeLogin(assignee.login));
  const candidates = [...new Set([prAuthor, ...assignees].filter(Boolean))];
  const implementer = requireWhitelistedAccount(accounts, candidates, 'PR author or issue assignee');
  const ideaOriginatorLogin = parseIdeaCredit(issue);
  const issueRef = `${repoSlug}#${issue.number}`;
  const entries = [];

  bounties.forEach(bounty => {
    const common = {
      issueRef,
      currency: bounty.currency,
      fund: PAYROLL_ASSET_CONFIG.fundSlug,
      queuedAt,
      queuedBy,
      prNumber: pr.number,
    };
    if (ideaOriginatorLogin) {
      const originator = requireWhitelistedAccount(accounts, [ideaOriginatorLogin], 'idea originator');
      const split = splitIdeaCredit(bounty.amount, bounty.currency);
      entries.push(
        { ...common, contributor: implementer.walletAddress, contributorGithub: implementer.github, amount: split.implementer, role: 'implementer' },
        { ...common, contributor: originator.walletAddress, contributorGithub: originator.github, amount: split.originator, role: 'idea-originator' }
      );
    } else {
      entries.push({
        ...common,
        contributor: implementer.walletAddress,
        contributorGithub: implementer.github,
        amount: bounty.amount,
      });
    }
  });

  const newEntries = entries.filter(entry => !isDuplicate(queue, entry));
  return {
    entries: newEntries,
    skippedDuplicates: entries.length - newEntries.length,
    bountyLabels: bounties.map(bounty => bounty.label),
  };
}

function updateAccountBalance(account, field, amount, currency, direction) {
  const storedBalance = Number(account[field] || 0);
  if (!Number.isFinite(storedBalance) || storedBalance < 0) {
    throw new Error(`Invalid ${currency} account balance in ${field}`);
  }
  const balance = storedBalance === 0 ? '0' : storedBalance.toFixed(currencyDecimals(currency));
  const balanceUnits = balance === '0' ? 0n : decimalUnits(balance, currency);
  const amountUnits = decimalUnits(amount, currency);
  const next = direction === 'subtract'
    ? (balanceUnits > amountUnits ? balanceUnits - amountUnits : 0n)
    : balanceUnits + amountUnits;
  account[field] = Number(formatUnits(next, currency));
}

function applyAccountAccrual(accounts, entries) {
  for (const entry of entries) {
    const account = findAccount(accounts, entry.contributorGithub);
    if (!account) continue;
    const { pending } = balanceFields(entry.currency);
    updateAccountBalance(account, pending, entry.amount, entry.currency, 'add');
    if (!Array.isArray(account.issuesClosed)) account.issuesClosed = [];
    if (!account.issuesClosed.includes(entry.issueRef)) account.issuesClosed.push(entry.issueRef);
    if (entry.role === 'idea-originator') {
      if (!Array.isArray(account.ideasCredited)) account.ideasCredited = [];
      if (!account.ideasCredited.includes(entry.issueRef)) account.ideasCredited.push(entry.issueRef);
    }
  }
}

function settleEntries({
  queue,
  accounts,
  contributorGithub = '',
  issueRef = '',
  role = '',
  currency = '',
  txHash = '',
  settledAt,
  settledBy,
}) {
  const contributorFilter = String(contributorGithub).trim().toLowerCase();
  const issueFilter = String(issueRef).trim();
  const roleFilter = String(role).trim().toLowerCase();
  const currencyFilter = currency ? normalizeCurrency(currency) : '';
  const matches = entry =>
    String(entry.contributorGithub || '').trim().toLowerCase() === contributorFilter &&
    String(entry.issueRef || '').trim() === issueFilter &&
    entryRole(entry) === roleFilter &&
    entryCurrency(entry) === currencyFilter;
  const selected = (queue.pending || []).filter(matches);
  queue.pending = (queue.pending || []).filter(entry => !matches(entry));
  const settled = selected.map(entry => ({
    ...entry,
    settledAt,
    settledBy,
    ...(txHash ? { txHash } : {}),
  }));
  if (!Array.isArray(queue.settled)) queue.settled = [];
  queue.settled.push(...settled);

  for (const entry of settled) {
    const account = findAccount(accounts, entry.contributorGithub);
    if (!account) continue;
    const { pending, earned } = balanceFields(entry.currency);
    updateAccountBalance(account, pending, entry.amount, entry.currency, 'subtract');
    updateAccountBalance(account, earned, entry.amount, entry.currency, 'add');
  }
  return settled;
}

module.exports = {
  BOUNTY_LABEL_RE,
  PAYROLL_ASSET_CONFIG,
  PAYROLL_ROLES,
  SUPPORTED_CURRENCIES,
  TEST_BOUNTY_LABEL_RE,
  applyAccountAccrual,
  balanceFields,
  createBountyEntries,
  extractIssueNumbers,
  findAccount,
  isDuplicate,
  normalizeAmount,
  normalizeCurrency,
  normalizeLogin,
  parseAmountLabel,
  parseAmountLabels,
  parseIdeaCredit,
  pickWhitelistedTester,
  settleEntries,
  splitIdeaCredit,
};
