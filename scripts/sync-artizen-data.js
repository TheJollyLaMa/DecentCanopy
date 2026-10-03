'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const SOURCE_URL = 'https://artizen.fyi/match/index.json';
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'artizen.json');

async function main() {
  const response = await fetch(SOURCE_URL, {
    headers: { accept: 'application/json' }
  });
  if (!response.ok) {
    throw new Error(`Artizen feed request failed with HTTP ${response.status}`);
  }

  const payload = await response.json();
  validatePayload(payload);

  const snapshot = {
    source: SOURCE_URL,
    generatedAt: payload.generatedAt,
    sourceCounts: payload.source,
    dataNotes: [
      'This public matching index provides project and fund records plus submitted, curated, and funded project-to-fund relationships.',
      'The index does not provide creator profile records, artifact-purchase records, or public-ledger transaction proofs.',
      'Creator and project associations in data/artizen-curation.json are locally curated and are not asserted by Artizen.'
    ],
    projects: payload.projects.map((project) => ({
      id: project.id,
      slug: project.slug,
      name: project.name,
      description: project.context?.description || project.description || '',
      tags: Array.isArray(project.tags) ? project.tags : [],
      facets: Array.isArray(project.facets) ? project.facets : [],
      image: project.image || null
    })),
    funds: payload.funds.map((fund) => ({
      id: fund.id,
      slug: fund.slug,
      name: fund.name,
      subtitle: fund.subtitle || '',
      description: fund.description || '',
      active: fund.active !== false,
      available: typeof fund.available === 'number' ? fund.available : null,
      image: fund.image || null
    })),
    relationships: payload.relationships.map((relationship) => ({
      projectId: relationship.projectId,
      fundId: relationship.fundId,
      kind: relationship.kind,
      seasonNumber: relationship.seasonNumber ?? null,
      createdAt: relationship.createdAt || null
    }))
  };

  const temporaryPath = `${OUTPUT_PATH}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(snapshot)}\n`);
  await fs.rename(temporaryPath, OUTPUT_PATH);

  console.log(
    `Saved ${snapshot.projects.length} projects, ${snapshot.funds.length} funds, and ` +
    `${snapshot.relationships.length} relationships to ${path.relative(process.cwd(), OUTPUT_PATH)} ` +
    `(source snapshot ${snapshot.generatedAt || 'date unavailable'}).`
  );
}

function validatePayload(payload) {
  if (!payload || payload.source?.kind !== 'artizen-api') {
    throw new Error('Artizen feed did not identify itself as the public artizen-api index.');
  }
  for (const field of ['projects', 'funds', 'relationships']) {
    if (!Array.isArray(payload[field])) {
      throw new Error(`Artizen feed is missing its ${field} array.`);
    }
  }
  if (!payload.projects.length || !payload.funds.length) {
    throw new Error('Artizen feed returned no projects or funds; refusing to replace the existing snapshot.');
  }
}

main().catch((error) => {
  console.error(`[sync-artizen-data] ${error.message}`);
  process.exitCode = 1;
});
