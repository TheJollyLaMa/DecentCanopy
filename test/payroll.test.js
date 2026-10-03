const test = require('node:test');
const assert = require('node:assert/strict');

const {
  BOUNTY_LABEL_RE,
  TEST_BOUNTY_LABEL_RE,
  applyAccountAccrual,
  createBountyEntries,
  extractIssueNumbers,
  parseAmountLabel,
  parseAmountLabels,
  pickWhitelistedTester,
  settleEntries,
  splitIdeaCredit,
} = require('../scripts/payroll');

const owner = {
  github: 'TheJollyLaMa',
  walletAddress: '0x807061DF657A7697c04045dA7d16D941861cAABc',
};

function fixture(overrides = {}) {
  return {
    issue: { number: 14, labels: [{ name: 'bounty: 100 ART' }], assignees: [{ login: 'TheJollyLaMa' }], ...overrides.issue },
    pr: { number: 15, user: { login: 'copilot-swe-agent[bot]' }, ...overrides.pr },
    accounts: { contributors: [{ ...owner }], ...overrides.accounts },
    queue: { pending: [], settled: [], ...overrides.queue },
    repoSlug: 'TheJollyLaMa/DecentCanopy',
    queuedAt: '2026-09-16T00:00:00.000Z',
    queuedBy: 'github-actions[bot]',
  };
}

test('accepts exact positive bounty labels for configured currencies', () => {
  assert.equal(parseAmountLabel({ labels: [{ name: 'bounty: 100 ART' }] }).amount, '100');
  assert.equal(parseAmountLabel({ labels: [{ name: 'bounty: 2.5 $ART' }] }).amount, '2.5');
  assert.equal(parseAmountLabel({ labels: [{ name: 'bounty: 3.25 USDC' }] }).currency, 'USDC');
  assert.equal(parseAmountLabel({ labels: [{ name: 'test-bounty: 10 ART' }] }, TEST_BOUNTY_LABEL_RE).amount, '10');
  assert.deepEqual(parseAmountLabels({ labels: [
    { name: 'bounty: 10 ART' },
    { name: 'bounty: 2.50 USDC' },
    { name: 'bounty: 1 ETH' },
  ] }).map(({ amount, currency }) => [amount, currency]), [['10', 'ART'], ['2.5', 'USDC']]);
  assert.match('bounty: 1 ART', BOUNTY_LABEL_RE);
  for (const label of ['bounty: 0 ART', 'bounty: -1 ART', 'bounty: 1 ETH', 'bounty: 1 ART extra', 'bounty: 1e3 ART']) {
    assert.equal(parseAmountLabel({ labels: [{ name: label }] }), null, label);
  }
  assert.throws(() => parseAmountLabels({ labels: [
    { name: 'bounty: 1 USDC' },
    { name: 'bounty: 2 USDC' },
  ] }), /more than one USDC/);
  assert.throws(() => parseAmountLabel({ labels: [{ name: 'bounty: 0.0000001 USDC' }] }), /at most 6 decimal places/);
});

test('combines body, title, linked, and manual issue references', () => {
  assert.deepEqual(extractIssueNumbers({
    body: 'Closes #14 and resolves TheJollyLaMa/DecentCanopy#18',
    title: 'Finish #14 and #22',
    linked: [18, 30],
    override: ['31'],
  }), [31, 14, 18, 22, 30]);
});

test('falls back from an unwhitelisted PR author to a whitelisted assignee', () => {
  const result = createBountyEntries(fixture());
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].contributorGithub, owner.github);
  assert.equal(result.entries[0].currency, 'ART');
});

test('splits exact idea credit into 80/20 role entries', () => {
  const result = createBountyEntries(fixture({ issue: {
    number: 14,
    labels: [{ name: 'bounty: 100 ART' }, { name: 'idea-credit: @TheJollyLaMa' }],
    assignees: [{ login: 'TheJollyLaMa' }],
  } }));
  assert.deepEqual(result.entries.map(entry => [entry.role, entry.amount]), [
    ['implementer', '80'],
    ['idea-originator', '20'],
  ]);
});

test('splits currency-denominated idea credit exactly without rounding', () => {
  assert.deepEqual(splitIdeaCredit('0.00000010'), {
    implementer: '0.00000008',
    originator: '0.00000002',
  });
  assert.deepEqual(splitIdeaCredit('2.50', 'USDC'), { implementer: '2', originator: '0.5' });
  assert.throws(() => splitIdeaCredit('0.000001', 'USDC'), /cannot be split exactly/);
});

test('generic idea-credit does not trigger a split', () => {
  const result = createBountyEntries(fixture({ issue: {
    number: 18,
    labels: [{ name: 'bounty: 100 ART' }, { name: 'idea-credit' }],
    assignees: [{ login: 'TheJollyLaMa' }],
  } }));
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].amount, '100');
});

test('deduplicates pending and settled role entries', () => {
  const issue = {
    number: 14,
    labels: [{ name: 'bounty: 100 ART' }, { name: 'idea-credit: @TheJollyLaMa' }],
    assignees: [{ login: 'TheJollyLaMa' }],
  };
  const previous = createBountyEntries(fixture({ issue })).entries;
  const result = createBountyEntries(fixture({ issue, queue: { pending: [previous[0]], settled: [previous[1]] } }));
  assert.equal(result.entries.length, 0);
  assert.equal(result.skippedDuplicates, 2);
});

test('queues ART and USDC independently into the configured repository fund', () => {
  const result = createBountyEntries(fixture({ issue: {
    number: 19,
    labels: [{ name: 'bounty: 25 ART' }, { name: 'bounty: 3.5 USDC' }],
    assignees: [{ login: 'TheJollyLaMa' }],
  } }));
  assert.deepEqual(result.entries.map(entry => [entry.currency, entry.amount, entry.fund]), [
    ['ART', '25', 'decentcanopy-repo-dev'],
    ['USDC', '3.5', 'decentcanopy-repo-dev'],
  ]);
});

test('same issue and contributor may earn separate currencies without duplicate collisions', () => {
  const artEntry = {
    issueRef: 'TheJollyLaMa/DecentCanopy#14',
    contributorGithub: owner.github,
    contributor: owner.walletAddress,
    amount: '1',
    currency: 'ART',
  };
  const usdcEntry = { ...artEntry, amount: '1', currency: 'USDC' };
  const queue = { pending: [artEntry], settled: [] };
  const issue = {
    number: 14,
    labels: [{ name: 'bounty: 1 ART' }, { name: 'bounty: 1 USDC' }],
    assignees: [{ login: 'TheJollyLaMa' }],
  };
  const result = createBountyEntries(fixture({ issue, queue }));
  assert.deepEqual(result.entries.map(entry => entry.currency), ['USDC']);
});

test('selects the commenting assigned tester and rejects ambiguity', () => {
  const accounts = { contributors: [
    { github: 'alice', walletAddress: '0x1111111111111111111111111111111111111111' },
    { github: 'bob', walletAddress: '0x2222222222222222222222222222222222222222' },
  ] };
  assert.equal(pickWhitelistedTester({ assigneeLogins: ['alice', 'bob'], accounts, commenter: 'bob' }).github, 'bob');
  assert.throws(() => pickWhitelistedTester({ assigneeLogins: ['alice', 'bob'], accounts, commenter: 'carol' }), /Multiple assigned testers/);
});

test('accrues and settles only the selected currency, role, contributor, and issue', () => {
  const accounts = { contributors: [{ ...owner, artPending: 0, artEarned: 0, usdcPending: 0, usdcEarned: 0, issuesClosed: [] }] };
  const target = { issueRef: 'TheJollyLaMa/DecentCanopy#14', contributorGithub: owner.github, contributor: owner.walletAddress, amount: '100', currency: 'ART', role: 'idea-originator' };
  const other = { ...target, issueRef: 'TheJollyLaMa/DecentCanopy#99', amount: '50', role: 'contributor' };
  const otherCurrency = { ...target, amount: '2.25', currency: 'USDC' };
  applyAccountAccrual(accounts, [target, other, otherCurrency]);
  assert.equal(accounts.contributors[0].artPending, 150);
  assert.equal(accounts.contributors[0].usdcPending, 2.25);
  assert.deepEqual(accounts.contributors[0].ideasCredited, [target.issueRef]);
  const queue = { pending: [target, other, otherCurrency], settled: [] };
  const settled = settleEntries({
    queue,
    accounts,
    contributorGithub: owner.github,
    issueRef: target.issueRef,
    role: 'idea-originator',
    currency: 'ART',
    txHash: `0x${'a'.repeat(64)}`,
    settledAt: '2026-09-16T01:00:00.000Z',
    settledBy: owner.github,
  });
  assert.equal(settled.length, 1);
  assert.deepEqual(queue.pending.map(entry => entry.currency), ['ART', 'USDC']);
  assert.equal(queue.settled[0].txHash, `0x${'a'.repeat(64)}`);
  assert.equal(accounts.contributors[0].artPending, 50);
  assert.equal(accounts.contributors[0].artEarned, 100);
  assert.equal(accounts.contributors[0].usdcPending, 2.25);
  assert.equal(accounts.contributors[0].usdcEarned, 0);
});