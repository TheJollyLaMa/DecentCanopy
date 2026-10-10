'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const F = require('../scripts/artizen-financials');
const data = require('../data/artizen-comprehensive-capture.json');
const archive = require('../data/artizen.json');
test('all eight saved public tables reproduce captured rows and source digests exactly', () => {
  for (const source of data.sources) {
    const bytes = zlib.gunzipSync(fs.readFileSync(require.resolve(`../data/artizen-source-captures/${source.file}`)));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), source.sha256);
    if (source.file === 'catalog.json.gz') {
      const catalog = JSON.parse(bytes);
      assert.equal(catalog.projects.length, data.coverage.publicCatalogProjects);
      assert.equal(catalog.relationships.length, data.coverage.publicCatalogRelationships);
      continue;
    }
    const season = data.seasons.find(s => s.source === source.url);
    const rows = F.parseLeaderboard(bytes.toString('utf8'), new Map(), season.season);
    assert.equal(rows.size, season.leaderboardProjectCount);
    assert.equal(season.projects.filter(p => p.metrics).length, rows.size);
    for (const [slug, metrics] of rows) assert.deepEqual(season.projects.find(p => p.slug === slug).metrics, metrics);
  }
});
test('coverage preserves all archive projects and distinguishes no financial records from zero', () => {
  const union = new Set(data.seasons.flatMap(s => s.projects.filter(p => p.metrics).map(p => p.slug)));
  assert.equal(union.size, data.coverage.projectsWithAnyFinancialRow);
  assert.equal(data.coverage.totalDistinctProjects - union.size, data.coverage.projectsWithoutFinancialRows.length);
  const final = data.seasons[7];
  for (const p of archive.projects) assert.ok(final.projects.some(q => q.id === `artizen-project:${p.id}` && q.slug === p.slug));
  for (const s of data.seasons.slice(0, 4)) assert.equal(s.leaderboardProjectCount, 0);
  for (const s of data.seasons.slice(4, 7)) for (const p of s.projects) assert.equal(p.metrics.bonus, null);
});
test('all-season overlay preserves base and signed records and exposes chronological financial history', () => {
  const row = data.seasons[6].projects[0];
  const signed = { projects: [{ key: 'one', archiveId: row.id }] };
  const base = { projects: [{ id: row.id, slug: row.slug, raised: 0 },
    { id: 'decent-project:wallet:one', creatorRecord: signed, creatorProjectKey: 'one' }], associations: [] };
  const before = JSON.stringify(base);
  const result = F.applyComprehensive(base, data);
  assert.equal(JSON.stringify(base), before);
  assert.equal(result.associations.length, 0);
  const history = result.projects[1].financialCaptures;
  assert.ok(history.some(c => c.season === 6));
  assert.equal(history.at(-1).season, 7);
  const rendered = F.renderHistory(history, String, n => `$${n.toFixed(2)}`);
  assert.match(rendered, /not a verified lifetime total/);
  assert.match(rendered, /Not supplied by this table/);
  assert.doesNotMatch(rendered, /Season 0 · \$0/);
  assert.equal(F.applyComprehensive(result, data).projects.length, result.projects.length);
  assert.throws(() => F.applyComprehensive(base, { ...data, seasons: data.seasons.slice(1) }), /Invalid/);
});
