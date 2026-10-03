'use strict';

const { renderArtFiComment } = require('./commentArt');
const { githubRequest, repositoryCoordinates } = require('./githubApi');
const { applyAccountAccrual, isDuplicate, normalizeAmount, PAYROLL_ASSET_CONFIG } = require('./payroll');
const { acceptedCids, checkPinner, rewardablePinners } = require('./communityPinning');
const { PATHS, isoWeek, readJson, writeJson } = require('./communityRewards');

const CHECK_HISTORY = 26;

function buildReport({ week, accepted, pinners, results, rewarded, config }) {
  const rewardedSet = new Set(rewarded.map(pinner => pinner.github));
  const rows = pinners.map(pinner => {
    const result = results.get(pinner.github);
    const outcome = result?.ok ? `✅ served \`${result.cid.slice(0, 14)}…\` in ${result.ms} ms` : `❌ ${result?.reason || 'not checked'}`;
    const reward = rewardedSet.has(pinner.github) ? `${config.amountPerWeek} ${config.currency}` : '—';
    return `| @${pinner.github} | ${new URL(pinner.gateway).host} | ${outcome} | ${reward} |`;
  });
  return [
    `Weekly check of community IPFS pinners for **${week}**.`,
    '',
    `Accepted backups: ${accepted.map(row => `\`${row.cid}\``).join(', ')}`,
    '',
    '| Pinner | Gateway | Result | Reward queued |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
    `${rewarded.length} of ${pinners.length} pinner${pinners.length === 1 ? '' : 's'} passed. Rewards are queued on the payroll and paid on Base when the maintainer settles them.`,
    '',
    '_A pass means the pinner\'s own gateway served byte-identical canopy data. It shows availability, not exclusive storage._',
  ].join('\n');
}

async function main() {
  const now = new Date();
  const dryRun = process.env.DRY_RUN === '1';
  const week = process.env.PINNING_WEEK || isoWeek(now);
  const config = readJson(PATHS.config).pinning;
  const pinners = readJson(PATHS.pinners);
  if (!Array.isArray(pinners.checks)) pinners.checks = [];
  if (pinners.checks.some(check => check.week === week)) {
    console.log(`Pinning check for ${week} already recorded.`);
    return;
  }
  const approved = pinners.pinners.filter(pinner => pinner.status === 'approved');
  if (!approved.length) {
    console.log('No approved community pinners yet.');
    return;
  }
  const accepted = acceptedCids(readJson(PATHS.backup), { now, maxAgeDays: config.acceptedCidAgeDays });
  if (!accepted.length) {
    console.log('The canopy has not published an IPFS backup yet; nothing to check.');
    return;
  }

  const results = new Map();
  for (const pinner of approved) {
    results.set(pinner.github, await checkPinner(pinner, accepted, { maxBytes: config.maxPayloadBytes }));
  }
  const rewarded = rewardablePinners(approved, results, config.maxRewardedPinnersPerWeek);
  const report = buildReport({ week, accepted, pinners: approved, results, rewarded, config });
  if (dryRun) {
    console.log(report);
    return;
  }

  const { owner, repo } = repositoryCoordinates();
  const issue = await githubRequest(`/repos/${owner}/${repo}/issues`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: `📌 Community pinning check — ${week}`, body: renderArtFiComment(report, 0, `pinning-${week}`), labels: ['pinning-check'] }),
  });
  const issueRef = `${owner}/${repo}#${issue.number}`;
  const queue = readJson(PATHS.queue);
  const accounts = readJson(PATHS.accounts);
  const entries = rewarded.map(pinner => ({
    issueRef,
    contributor: pinner.wallet,
    contributorGithub: pinner.github,
    amount: normalizeAmount(config.amountPerWeek, config.currency),
    currency: config.currency,
    fund: PAYROLL_ASSET_CONFIG.fundSlug,
    role: 'pinner',
    period: week,
    queuedAt: now.toISOString(),
    queuedBy: 'pinning-bot',
  })).filter(entry => !isDuplicate(queue, entry));
  queue.pending.push(...entries);
  applyAccountAccrual(accounts, entries);

  for (const pinner of approved) {
    const result = results.get(pinner.github);
    pinner.lastCheck = { week, ok: result.ok, cid: result.cid || null, reason: result.ok ? null : result.reason, checkedAt: now.toISOString() };
    if (result.ok) pinner.weeksPassed = (pinner.weeksPassed || 0) + 1;
  }
  pinners.checks.unshift({ week, issueRef, checked: approved.length, passed: [...results.values()].filter(result => result.ok).length, rewarded: entries.length, checkedAt: now.toISOString() });
  pinners.checks = pinners.checks.slice(0, CHECK_HISTORY);
  writeJson(PATHS.queue, queue);
  writeJson(PATHS.accounts, accounts);
  writeJson(PATHS.pinners, pinners);
  await githubRequest(`/repos/${owner}/${repo}/issues/${issue.number}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: 'closed', state_reason: 'completed' }),
  }).catch(error => console.warn(`Could not close ${issueRef}: ${error.message}`));
  console.log(`Recorded ${week}: ${entries.length} pinner reward(s) queued in ${issueRef}.`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = { buildReport };
