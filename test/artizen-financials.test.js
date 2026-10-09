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
test('full collection covers every archived, curated and leaderboard project while preserving unknowns and frozen hashes', () => {
  F.validate(captures);
  const curation = require('../data/artizen-curation.json');
  for (const p of snapshot.projects) assert.ok(captures.projects.some(row => row.id === `artizen-project:${p.id}` && row.slug === p.slug));
  for (const p of curation.projects) assert.ok(captures.projects.some(row => row.slug === p.slug));
  assert.equal(captures.projects.filter(p => p.status === 'captured').length, captures.leaderboardProjectCount);
  assert.equal(captures.projects.filter(p => p.id.startsWith('artizen-supplement:')).length, captures.unmatchedLeaderboardSlugs.length);
  assert.ok(captures.projects.some(p => p.metrics === null));
  assert.equal(new Set(captures.projects.map(p => p.slug)).size, captures.projects.length);
  assert.equal(captures.projects.find(p => p.slug === 'debolso').metrics.raised, 28851.584269610295);
  assert.equal(captures.projects.find(p => p.slug === 'decent-canopy').status, 'captured');
  assert.equal(captures.projects.find(p => p.slug === 'qart-code').status, 'captured');
  assert.equal(captures.projects.find(p => p.slug === 'artfi').metrics, null);
  const manifest = require('../data/artizen-archive.json');
  for (const [file, digest] of [['artizen.json', manifest.snapshotSha256], ['artizen-curation.json', manifest.curationSha256]]) {
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(require.resolve(`../data/${file}`))).digest('hex'), digest);
  }
  const bad = structuredClone(captures);
  bad.projects.find(p => !p.metrics).metrics = { raised: 0 };
  assert.throws(() => F.validate(bad), /unknown/);
});
test('overlay never replaces archived fields or joins on a mismatching slug', () => {
  const row = captures.projects[0], raw = snapshot.projects.find(p => `artizen-project:${p.id}` === row.id);
  const node = { ...raw, id: row.id, raised: 0, goal: 0, publicStats: { total: 10 } };
  const base = { projects: [node], associations: [] }, before = JSON.stringify(base);
  const selected = { ...captures, projects: [row] };
  const result = F.apply(base, selected);
  assert.equal(JSON.stringify(base), before);
  assert.equal(result.projects.length, 1);
  assert.equal(result.projects[0].raised, 0);
  assert.equal(result.projects[0].publicStats.total, 10);
  assert.equal(result.projects[0].financialCapture.metrics.raised, row.metrics.raised);
  assert.equal(F.apply({ projects: [{ ...node, slug: 'other' }] }, selected).projects[0].financialCapture, undefined);
});
test('supplemental projects are separate, idempotent blips with no invented relationships', () => {
  const source = captures.projects.find(p => p.id.startsWith('artizen-supplement:'));
  const selected = { ...captures, projects: [source] };
  const base = { projects: [], associations: [] };
  const result = F.apply(base, selected);
  assert.equal(base.projects.length, 0);
  assert.equal(result.projects.length, 1);
  assert.match(result.projects[0].sourceLabel, /not in frozen archive/);
  assert.equal(result.projects[0].financialCapture.metrics.raised, source.metrics.raised);
  assert.equal(result.associations.length, 0);
  assert.equal(F.apply(result, selected).projects.length, 1);
});
test('creator financials follow only explicit existing historical references and never modify signed records', () => {
  const source = captures.projects.find(p => p.slug === 'decent-canopy');
  const signed = { projects: [{ key: 'canopy', archiveId: source.id }, { key: 'unlinked', archiveId: '' }] };
  const base = { projects: [
    { id: source.id, slug: source.slug },
    { id: 'decent-project:wallet:canopy', creatorRecord: signed, creatorProjectKey: 'canopy' },
    { id: 'decent-project:wallet:unlinked', creatorRecord: signed, creatorProjectKey: 'unlinked' }
  ], associations: [] };
  const before = JSON.stringify(base);
  const result = F.apply(base, { ...captures, projects: [source] });
  assert.equal(JSON.stringify(base), before);
  assert.equal(result.projects[1].financialCapture.historicalReference, source.id);
  assert.equal(result.projects[2].financialCapture, undefined);
  const rendered = F.render(result.projects[1].financialCapture, String, n => `$${n.toFixed(2)}`);
  assert.match(rendered, /self-reported historical reference/);
  assert.match(rendered, /not verified project ownership/);
});
test('requested BigNuten and qArt captures use exact curated keys without overriding signed references', () => {
  const id = 'decent-project:0x807061df657a7697c04045da7d16d941861caabc:b5053fb2-dfa8-4716-a53f-d7c8376daf6b';
  const source = captures.projects.find(p => p.slug === 'bignuten');
  const signed = { projects: [{ key: 'b5053fb2-dfa8-4716-a53f-d7c8376daf6b', archiveId: '' }] };
  const node = { id, creatorProjectKey: signed.projects[0].key, creatorRecord: signed };
  const base = { projects: [{ id: source.id, slug: source.slug }, node], associations: [] };
  const selected = { ...captures, projects: [source] };
  const result = F.apply(base, selected);
  assert.equal(result.projects[1].financialCapture.referenceKind, 'locally-curated');
  assert.match(F.render(result.projects[1].financialCapture, String, String), /locally curated historical association/);
  assert.equal(signed.projects[0].archiveId, '');
  assert.equal(F.apply({ ...base, projects: [base.projects[0], { ...node, id: id.replace('0x807061', '0x907061') }] }, selected).projects[1].financialCapture, undefined);
  signed.projects[0].archiveId = 'curated-project:unrelated';
  assert.equal(F.apply(base, selected).projects[1].financialCapture, undefined);
});
test('cards distinguish source-captured totals, unknowns, and payments without exposing live fetches', () => {
  const currency = n => `$${n.toFixed(2)}`;
  const captured = { ...captures.projects[0], source: captures.source, capturedAt: captures.capturedAt, season: 7 };
  const rendered = F.render(captured, s => String(s), currency);
  assert.match(rendered, /\$28851\.58 reported raised/);
  assert.match(rendered, /not verified payments or payouts/);
  assert.match(rendered, /Venus extras/);
  assert.match(rendered, /source freshness is unknown/);
  const missing = F.render({ ...captured, ...captures.projects.find(p => !p.metrics) }, s => String(s), currency);
  assert.match(missing, /Amount unknown, not \$0/);
  assert.doesNotMatch(missing, /reported raised/);
  assert.equal(F.render(null), '');
});
test('leaderboard project details decode escaped text without treating markup as project names', () => {
  const identities = new Map();
  F.parseLeaderboard(html().replace('>Example</a>', '>Dream &amp; &#x1f333;</a>'), identities);
  assert.equal(identities.get('example').name, 'Dream & 🌳');
  assert.throws(() => F.parseLeaderboard(html().replace('>Example</a>', '>Bad &#99999999;</a>')), /Invalid character/);
});
