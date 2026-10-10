'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const F = require('./artizen-financials');
const ROOT = path.resolve(__dirname, '..');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function retrieve(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000), cache: 'no-store' });
  if (!response.ok) throw new Error(`Public archive source ${url} returned HTTP ${response.status}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  return { bytes, url, capturedAt: new Date().toISOString(), sha256: sha256(bytes) };
}
async function main() {
  const catalog = await retrieve('https://artizen.fyi/match/index.json');
  const index = JSON.parse(catalog.bytes.toString('utf8'));
  if (!Array.isArray(index.projects) || !index.projects.length || !Array.isArray(index.funds)
    || !Array.isArray(index.relationships) || !Number.isFinite(Date.parse(index.generatedAt))) throw new Error('Invalid public Artizen catalog.');
  const archive = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/artizen.json')));
  const curation = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/artizen-curation.json')));
  const identities = new Map(), seasons = [], sources = [];
  const projects = new Map(archive.projects.map(p => [p.slug, { id: `artizen-project:${p.id}`, slug: p.slug, name: p.name }]));
  for (const p of curation.projects) if (!projects.has(p.slug)) projects.set(p.slug, { id: `curated-project:${p.slug}`, slug: p.slug, name: p.name });
  for (const p of index.projects) {
    if (!p.id || !p.slug || !p.name) throw new Error('Missing public catalog project identity.');
    const existing = projects.get(p.slug);
    if (existing && existing.id !== `artizen-project:${p.id}`) throw new Error(`Catalog identity conflict for ${p.slug}; refusing an inferred match.`);
    if (!existing) projects.set(p.slug, { id: `artizen-supplement:${p.slug}`, slug: p.slug, name: p.name, description: p.description || '' });
  }
  for (let season = 0; season <= 7; season++) {
    const source = await retrieve(`https://artizen.fyi/projects?season=${season}`);
    const rows = F.parseLeaderboard(source.bytes.toString('utf8'), identities, season);
    sources.push({ ...source, file: `season-${season}.html.gz` });
    seasons.push({ season, rows, source });
    for (const slug of rows.keys()) if (!projects.has(slug)) projects.set(slug, { id: `artizen-supplement:${slug}`, slug, ...identities.get(slug) });
    console.log(`Season ${season}: ${rows.size} public table rows${rows.size ? '' : ' (explicitly empty; no financial coverage)'}.`);
  }
  const capture = {
    format: 'decentcanopy-artizen-comprehensive-capture', version: 1, capturedAt: new Date().toISOString(),
    coverage: {
      frozenProjects: archive.projects.length, publicCatalogProjects: index.projects.length,
      publicCatalogGeneratedAt: index.generatedAt, publicCatalogFunds: index.funds.length,
      publicCatalogRelationships: index.relationships.length, totalDistinctProjects: projects.size,
      projectsWithAnyFinancialRow: [...projects.keys()].filter(slug => seasons.some(s => s.rows.has(slug))).length,
      projectsWithoutFinancialRows: [...projects.values()].filter(p => !seasons.some(s => s.rows.has(p.slug))).map(p => ({ id: p.id, slug: p.slug, name: p.name })),
      limitations: 'All returned rows from public Season 0–7 tables, not proof that upstream records are complete or current. No authenticated data, browser caches, creator identity inference, payout verification or cross-season summation.',
    },
    sources: [{ url: catalog.url, capturedAt: catalog.capturedAt, sha256: catalog.sha256, file: 'catalog.json.gz' },
      ...sources.map(({ bytes, ...source }) => source)],
    seasons: seasons.map(({ season, rows, source }) => F.validate({
      format: 'decentcanopy-artizen-financial-captures', version: 1, source: source.url, capturedAt: source.capturedAt,
      season, currency: 'USD', sourceSha256: source.sha256, leaderboardProjectCount: rows.size,
      selection: 'Exact project slugs from the frozen archive, public catalog, curation and all public season tables.',
      projects: [...projects.values()].filter(p => season === 7 || rows.has(p.slug)).map(p => ({
        ...p, status: rows.has(p.slug) ? 'captured' : 'not-in-season-leaderboard', metrics: rows.get(p.slug) || null
      }))
    })),
  };
  const sourceDir = path.join(ROOT, 'data/artizen-source-captures');
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, 'catalog.json.gz'), zlib.gzipSync(catalog.bytes));
  for (const s of sources) fs.writeFileSync(path.join(sourceDir, s.file), zlib.gzipSync(s.bytes));
  fs.writeFileSync(path.join(ROOT, 'data/artizen-comprehensive-capture.json'), JSON.stringify(capture, null, 2) + '\n');
  console.log(`Captured ${projects.size} distinct projects; ${capture.coverage.projectsWithAnyFinancialRow} have at least one financial row. Original frozen files unchanged.`);
}
if (require.main === module) main().catch(error => { console.error(`[captureArtizenArchive] ${error.message}`); process.exitCode = 1; });
