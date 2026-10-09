'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Financials = require('./artizen-financials');
const ROOT = path.resolve(__dirname, '..');
async function main() {
  const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/artizen.json'), 'utf8'));
  const curation = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/artizen-curation.json'), 'utf8'));
  const known = new Set(curation.projects.map(p => p.slug));
  const batch = snapshot.projects.filter(p => !known.has(p.slug)).slice(0, 10);
  const response = await fetch(Financials.SOURCE, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Public leaderboard failed (${response.status}).`);
  const html = await response.text(), rows = Financials.parseLeaderboard(html);
  const data = Financials.validate({
    format: 'decentcanopy-artizen-financial-captures', version: 1, source: Financials.SOURCE,
    capturedAt: new Date().toISOString(), season: 7, currency: 'USD',
    sourceSha256: crypto.createHash('sha256').update(html).digest('hex'),
    selection: 'First ten archived projects excluding the existing curated project captures, in archive order.',
    projects: batch.map(p => ({ id: `artizen-project:${p.id}`, slug: p.slug, name: p.name,
      status: rows.has(p.slug) ? 'captured' : 'not-in-season-leaderboard', metrics: rows.get(p.slug) || null })),
  });
  const output = path.join(ROOT, 'data/artizen-financial-captures.json');
  fs.writeFileSync(output, JSON.stringify(data, null, 2) + '\n');
  console.log(`Captured ${data.projects.filter(p => p.metrics).length}/${batch.length} project totals. Missing amounts remain unknown. Saved ${path.relative(ROOT, output)}; frozen archive unchanged.`);
}
if (require.main === module) main().catch(error => { console.error(`[captureArtizenFinancials] ${error.message}`); process.exitCode = 1; });
