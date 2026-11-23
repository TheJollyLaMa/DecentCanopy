'use strict';

const { id, verifyMessage } = require('../relay/node_modules/ethers');
const Records = require('./creator-records');

const REPO = 'TheJollyLaMa/DecentCanopy';
const HEAD_URL = `https://api.github.com/repos/${REPO}/commits/main`;
const INDEX_PATH = 'data/decent-creators.json';
const MAX_RESPONSE_BYTES = 5_000_000;

async function publicJson(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache', 'User-Agent': 'DecentCanopy-supporter-review' },
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Public Canopy source returned HTTP ${response.status}: ${url}`);
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw new Error(`Public Canopy response is too large: ${url}`);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Public Canopy source returned invalid JSON: ${url}`, { cause: error });
  }
}

async function mainRevision(fetchImpl) {
  const body = await publicJson(HEAD_URL, fetchImpl);
  if (typeof body.sha !== 'string' || !/^[0-9a-f]{40}$/.test(body.sha)) {
    throw new Error('Public Canopy main revision was not available.');
  }
  return body.sha;
}

async function loadPublicIndex(fetchImpl = fetch) {
  const revision = await mainRevision(fetchImpl);
  const rawUrl = `https://raw.githubusercontent.com/${REPO}/${revision}/${INDEX_PATH}`;
  const index = await publicJson(rawUrl, fetchImpl);
  if (await mainRevision(fetchImpl) !== revision) {
    throw new Error('Canopy main changed during verification. Run the check again.');
  }
  return {
    index,
    source: `https://github.com/${REPO}/blob/${revision}/${INDEX_PATH}`,
    revision,
    observedAt: new Date().toISOString(),
  };
}

function verifyPublicProject(index, wallet, key) {
  if (typeof wallet !== 'string' || !/^0x[0-9a-f]{40}$/i.test(wallet) || /^0x0{40}$/i.test(wallet)) {
    throw new Error('Creator wallet must be a non-zero 0x address.');
  }
  if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{1,50}$/.test(key)) {
    throw new Error('Project key must contain 1-50 ASCII letters, numbers, underscores or hyphens.');
  }
  if (!index || index.version !== 1 || !Array.isArray(index.creators) ||
      typeof index.updatedAt !== 'string' || !Number.isFinite(Date.parse(index.updatedAt))) {
    throw new Error('Unsupported or invalid public creator index.');
  }

  const seen = new Set();
  let selected;
  for (const entry of index.creators) {
    const record = Records.verify(entry, verifyMessage);
    if (JSON.stringify(record) !== JSON.stringify(entry.record) ||
        typeof entry.cid !== 'string' || !Records.CID.test(entry.cid) ||
        typeof entry.publishedAt !== 'string' || !Number.isFinite(Date.parse(entry.publishedAt)) ||
        seen.has(record.wallet)) {
      throw new Error('Creator index contains an invalid or duplicate signed profile.');
    }
    seen.add(record.wallet);
    if (record.wallet === wallet.toLowerCase()) selected = { entry, record };
  }
  if (!selected) throw new Error('Creator wallet was not found in the public index.');
  const project = selected.record.projects.find(item => item.key === key);
  if (!project) throw new Error("Project key was not found in this wallet's public profile.");
  const projectId = `decent-project:${selected.record.wallet}:${project.key}`;
  return {
    creator: {
      wallet: selected.record.wallet,
      recordRevision: selected.record.revision,
      publishedAt: selected.entry.publishedAt,
      cid: selected.entry.cid,
    },
    project: { id: projectId, hash: id(projectId), key: project.key, name: project.name, status: project.status },
    indexUpdatedAt: index.updatedAt,
  };
}

async function prepare(wallet, key, fetchImpl = fetch) {
  const snapshot = await loadPublicIndex(fetchImpl);
  const result = verifyPublicProject(snapshot.index, wallet, key);
  return {
    status: 'public-self-report-verified',
    source: snapshot.source,
    revision: snapshot.revision,
    observedAt: snapshot.observedAt,
    ...result,
    proposedApproval: {
      method: 'setCreatorProjectApproval',
      args: [result.creator.wallet, result.project.id, true],
    },
    limitations: [
      'The wallet signed this self-report; this does not independently establish project ownership.',
      'The CID format is checked, not the availability or content of the IPFS object.',
      'The index can change after this check. Recheck before approval and manually revoke when needed.',
      'No contract, chain, wallet, signature, or transaction is selected or sent by this tool.',
    ],
  };
}

if (require.main === module) {
  if (process.argv.length !== 4) {
    console.error('Usage: node scripts/prepare-supporter-approval.js <creator-wallet> <project-key>');
    process.exitCode = 1;
  } else {
    prepare(process.argv[2], process.argv[3])
      .then(result => console.log(JSON.stringify(result, null, 2)))
      .catch(error => {
        console.error(`[supporter-approval] ${error.message}`);
        process.exitCode = 1;
      });
  }
}

module.exports = { HEAD_URL, loadPublicIndex, verifyPublicProject, prepare };
