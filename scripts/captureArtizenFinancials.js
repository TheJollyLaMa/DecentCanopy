'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Financials = require('./artizen-financials');
const ROOT = path.resolve(__dirname, '..');
async function main() {
  const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/artizen.json'), 'utf8'));
  const curation = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/artizen-curation.json'), 'utf8'));
  const known = new Set(snapshot.projects.map(p => p.slug));
  const batch = snapshot.projects.map(p => ({ ...p, id: `artizen-project:${p.id}` }))
    .concat(curation.projects.filter(p => !known.has(p.slug)).map(p => ({ ...p, id: `curated-project:${p.slug}` })));
  const response = await fetch(Financials.SOURCE, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Public leaderboard failed (${response.status}).`);
  const html = await response.text(), identities = new Map(), rows = Financials.parseLeaderboard(html, identities);
  const selected = new Set(batch.map(p => p.slug));
  const unmatched = [...rows.keys()].filter(slug => !selected.has(slug));
  batch.push(...unmatched.map(slug => ({ id: `artizen-supplement:${slug}`, slug, ...identities.get(slug) })));
  const data = Financials.validate({
    format: 'decentcanopy-artizen-financial-captures', version: 1, source: Financials.SOURCE,
    capturedAt: new Date().toISOString(), season: 7, currency: 'USD',
    sourceSha256: crypto.createHash('sha256').update(html).digest('hex'),
    selection: 'Every frozen archived and curated project, plus unmatched public Season 7 leaderboard projects as separate supplemental blips.',
    leaderboardProjectCount: rows.size,
    unmatchedLeaderboardSlugs: unmatched,
    projects: batch.map(p => ({ id: p.id, slug: p.slug, name: p.name,
      ...(p.id.startsWith('artizen-supplement:') ? { description: p.description } : {}),
      status: rows.has(p.slug) ? 'captured' : 'not-in-season-leaderboard', metrics: rows.get(p.slug) || null })),
  });
  const output = path.join(ROOT, 'data/artizen-financial-captures.json');
  fs.writeFileSync(output, JSON.stringify(data, null, 2) + '\n');
  console.log(`Captured ${data.projects.filter(p => p.metrics).length}/${batch.length} project totals. Missing amounts remain unknown. Saved ${path.relative(ROOT, output)}; frozen archive unchanged.`);
}
if (require.main === module) main().catch(error => { console.error(`[captureArtizenFinancials] ${error.message}`); process.exitCode = 1; });
