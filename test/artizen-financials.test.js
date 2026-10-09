'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const F = require('../scripts/artizen-financials');
const snapshot = require('../data/artizen.json');
const captures = require('../data/artizen-financial-captures.json');
const headers = ['Project', 'Sales', 'Venus sales', 'S+VS', 'Match', 'S+VS+M', 'Venus extras', 'Prize', 'Bonus', 'Raised', 'V/S', 'M/S', 'P/S', 'B/S', 'R/S'];
function html(values = [10, 2, 12, 3, 15, 4, 5, 6, 30, 0, 0, 0, 0, 0]) {
  return `<option value="7" selected>Season 7</option><table id="artizen-projects-table"><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr><tr><td><a href="/projects/example">Example</a></td>${values.map(v => `<td data-order="${v}">$rounded<br><small>99</small></td>`).join('')}</tr></table>`;
}
test('leaderboard parser uses exact data-order values and validated column meanings, not rank labels', () => {
  const row = F.parseLeaderboard(html()).get('example');
  assert.equal(row.raised, 30);
  assert.equal(row.prize, 5);
  assert.equal(row.bonus, 6);
  assert.throws(() => F.parseLeaderboard(html().replace('<th>Raised</th>', '<th>Total</th>')), /columns changed/);
  assert.throws(() => F.parseLeaderboard(html().replace('value="7" selected', 'value="6" selected')), /Season 7/);
  assert.throws(() => F.parseLeaderboard(html().replace('data-order="30"', 'data-order="100"')), /reconcile/);
  assert.throws(() => F.parseLeaderboard(html().replace('data-order="30"', 'data-order=""')), /Invalid/);
  assert.throws(() => F.parseLeaderboard('<html>Sign in</html>'), /Expected/);
});
test('ten-project batch preserves unknowns, precise captured amounts and frozen archive hashes', () => {
  F.validate(captures);
  assert.equal(captures.projects.length, 10);
  assert.equal(captures.projects.filter(p => p.status === 'captured').length, 3);
  assert.equal(captures.projects.filter(p => p.metrics === null).length, 7);
  assert.equal(captures.projects.find(p => p.slug === 'debolso').metrics.raised, 28851.584269610295);
  const manifest = require('../data/artizen-archive.json');
  for (const [file, digest] of [['artizen.json', manifest.snapshotSha256], ['artizen-curation.json', manifest.curationSha256]]) {
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(require.resolve(`../data/${file}`))).digest('hex'), digest);
  }
  const bad = structuredClone(captures);
  bad.projects.find(p => !p.metrics).metrics = { raised: 0 };
  assert.throws(() => F.validate(bad), /unknown/);
});
test('overlay never replaces archived fields, invents projects, or joins on a mismatching slug', () => {
  const row = captures.projects[0], raw = snapshot.projects.find(p => `artizen-project:${p.id}` === row.id);
  const node = { ...raw, id: row.id, raised: 0, goal: 0, publicStats: { total: 10 } };
  const base = { projects: [node], associations: [] }, before = JSON.stringify(base);
  const result = F.apply(base, captures);
  assert.equal(JSON.stringify(base), before);
  assert.equal(result.projects.length, 1);
  assert.equal(result.projects[0].raised, 0);
  assert.equal(result.projects[0].publicStats.total, 10);
  assert.equal(result.projects[0].financialCapture.metrics.raised, row.metrics.raised);
  assert.equal(F.apply({ projects: [{ ...node, slug: 'other' }] }, captures).projects[0].financialCapture, undefined);
});
test('cards distinguish source-captured totals, unknowns, and payments without exposing live fetches', () => {
  const currency = n => `$${n.toFixed(2)}`;
  const captured = { ...captures.projects[0], source: captures.source, capturedAt: captures.capturedAt, season: 7 };
  const rendered = F.render(captured, s => String(s), currency);
  assert.match(rendered, /\$28851\.58 reported raised/);
  assert.match(rendered, /not verified payments or payouts/);
  assert.match(rendered, /Venus extras/);
  assert.match(rendered, /source freshness is unknown/);
  const missing = F.render({ ...captured, ...captures.projects[1] }, s => String(s), currency);
  assert.match(missing, /Amount unknown, not \$0/);
  assert.doesNotMatch(missing, /reported raised/);
  assert.equal(F.render(null), '');
});
