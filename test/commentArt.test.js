const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ARTWORKS,
  ENS_ETH_LOGO_URL,
  PROJECT_LOGO_URL,
  artworkIndex,
  renderArtFiComment,
  renderArtworkTable,
  selectArtwork,
} = require('../scripts/commentArt');
const { buildMergedPayrollComment } = require('../scripts/processMergedBounty');
const { buildTestingComment } = require('../scripts/processTestingBounty');
const { buildSettlementComment, validateSettlementInputs } = require('../scripts/settlePayroll');

test('contains 25 unique visible 10x10 branded scenes', () => {
  assert.equal(ARTWORKS.length, 25);
  assert.equal(new Set(ARTWORKS.map(artwork => artwork.name)).size, 25);
  assert.equal(new Set(ARTWORKS.map(artwork => JSON.stringify(artwork.rows))).size, 25);
  for (const artwork of ARTWORKS) {
    assert.equal(artwork.rows.length, 10);
    for (const row of artwork.rows) assert.equal(row.length, 10);
    assert.ok(artwork.rows.flat().includes('🟢'));
    assert.ok(artwork.rows.flat().includes('💠'));
  }
});

test('selection is deterministic and rotates through all scenes', () => {
  assert.equal(selectArtwork(30, 'merged-payroll'), selectArtwork(30, 'merged-payroll'));
  const selected = new Set();
  for (let issueNumber = 1; issueNumber <= 100; issueNumber += 1) {
    selected.add(artworkIndex(issueNumber, `event-${issueNumber % 4}`));
  }
  assert.equal(selected.size, 25);
});

test('renders both committed assets as cells with alt text and no dropdown', () => {
  const rendered = renderArtFiComment('✅ Queued 25 ART.', 30, 'merged-payroll');
  assert.match(rendered, new RegExp(PROJECT_LOGO_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(rendered, new RegExp(ENS_ETH_LOGO_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(rendered, /alt="Artizen logo"/);
  assert.match(rendered, /alt="ENS and Ethereum logo"/);
  assert.doesNotMatch(rendered, /<details>|<summary>|```/);
  const table = renderArtworkTable(selectArtwork(30, 'merged-payroll'));
  assert.equal((table.match(/<tr>/g) || []).length, 10);
  assert.equal((table.match(/<td /g) || []).length, 100);
});

test('production comments retain their message and visible branded art', () => {
  const comments = [
    buildMergedPayrollComment({
      entries: [{ amount: '20', contributorGithub: 'builder', role: 'implementer' }],
      isManual: false,
      prNumber: 32,
      issueNumber: 30,
    }),
    buildTestingComment('✅ Testing payout queued.', 30, 'test-approved'),
    buildSettlementComment({ settledCount: 2, actor: 'TheJollyLaMa', txHash: '0x123', issueNumber: 30 }),
  ];

  assert.match(comments[0], /Payroll queued from merged PR #32/);
  assert.match(comments[1], /Testing payout queued/);
  assert.match(comments[2], /Settled 2 ART payroll entries/);
  for (const comment of comments) {
    assert.match(comment, /Artizen logo/);
    assert.match(comment, /ENS and Ethereum logo/);
    assert.doesNotMatch(comment, /<details>|<summary>/);
  }
});

test('settlement requires an exact ledger selector and a confirmed transaction hash', () => {
  const valid = {
    contributorGithub: 'builder',
    issueRef: 'TheJollyLaMa/DecentCanopy#42',
    role: 'implementer',
    currency: 'USDC',
    txHash: `0x${'a'.repeat(64)}`,
  };
  assert.equal(validateSettlementInputs(valid), undefined);
  assert.throws(() => validateSettlementInputs({ ...valid, issueRef: '' }), /all required/);
  assert.throws(() => validateSettlementInputs({ ...valid, role: 'owner' }), /unsupported payroll role/);
  assert.throws(() => validateSettlementInputs({ ...valid, currency: 'BNUT' }), /unsupported payroll asset/);
  assert.throws(() => validateSettlementInputs({ ...valid, txHash: 'pending' }), /32-byte transaction hash/);
});