import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import Model from './repository-activity.js';
import Supporters from './supporter-dnft-model.js';
import { buildCatalog } from './build-supporter-dnfts.mjs';

const ROOT = new URL('../', import.meta.url);
const read = async file => JSON.parse(await fs.readFile(new URL(file, ROOT), 'utf8'));

export async function cacheArtwork(row, { fetchImpl = fetch, write = fs.writeFile, mkdir = fs.mkdir } = {}) {
  const supporter = row.release?.supporter;
  if (!supporter) return;
  const directory = `assets/supporter-releases/${createHash('sha256').update(`${row.repo}:${row.release.tag}`).digest('hex').slice(0, 24)}`;
  try {
    const images = await Promise.all(['front', 'back'].map(async side => {
      const response = await fetchImpl(supporter[side], { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`Artwork HTTP ${response.status}`);
      const limit = 5 * 1024 * 1024;
      if (Number(response.headers.get('content-length')) > limit) throw new Error('Artwork exceeds 5 MiB.');
      const reader = response.body.getReader(), parts = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > limit) throw new Error('Artwork exceeds 5 MiB.');
          parts.push(value);
        }
      } finally { await reader.cancel(); }
      const bytes = Buffer.concat(parts);
      if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
          bytes.toString('ascii', 12, 16) !== 'IHDR' || !bytes.readUInt32BE(16) || !bytes.readUInt32BE(20) ||
          bytes.readUInt32BE(16) > 4096 || bytes.readUInt32BE(20) > 4096) {
        throw new Error('Release artwork is not a PNG with dimensions.');
      }
      return [side, bytes];
    }));
    await mkdir(new URL(`${directory}/`, ROOT), { recursive: true });
    for (const [side, bytes] of images) {
      await write(new URL(`${directory}/${side}.png`, ROOT), bytes);
      supporter[`${side}Preview`] = `${directory}/${side}.png`;
    }
  } catch (error) {
    delete supporter.frontPreview;
    delete supporter.backPreview;
    row.error += `${row.error ? ' ' : ''}Release artwork preview unavailable: ${error.message}`;
    console.warn(`${row.repo}: ${row.error}`);
  }
}

export function referencedRepos(text, source, catalog) {
  return [...new Set(catalog.map(item => item.repo))].filter(repo => {
    if (repo === source) return false;
    const escaped = repo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9_./:\\\\-])(?:https://github\\.com/)?${escaped}(?:\\.git)?(?=$|[#/\\s)\\]},;:!?"'\`])`, 'i').test(text);
  });
}

export async function collect(repo, { fetchImpl = fetch, now = () => new Date(), token = process.env.GITHUB_TOKEN, catalog = [] } = {}) {
  const attemptedAt = now().toISOString();
  const request = async (route, { optional = false, asset = false } = {}) => {
    const response = await fetchImpl(asset ? route : `https://api.github.com/repos/${repo}${route}`, {
      headers: { Accept: 'application/vnd.github+json', ...(!asset && token ? { Authorization: `Bearer ${token}` } : {}) },
      redirect: asset ? 'follow' : 'error', signal: AbortSignal.timeout(15000)
    });
    if (optional && response.status === 404) return null;
    if (!response.ok) throw new Error(`Public GitHub read failed (HTTP ${response.status}).`);
    return response.json();
  };
  try {
    const info = await request('');
    if (info.private !== false || info.visibility !== 'public' ||
        Supporters.normalizeRepo(info.html_url) !== repo || info.full_name?.toLowerCase() !== repo) {
      throw new Error('Public repository identity changed or was not confirmed.');
    }
    const row = { repo, status: 'ok', attemptedAt, checkedAt: attemptedAt,
      windowStart: new Date(now().getTime() - Model.WINDOW_MS).toISOString(),
      defaultBranch: info.default_branch, archived: info.archived,
      openIssuesAndPRs: info.open_issues_count, commits7d: info.size === 0 ? 0 : null, capped: false, latestCommit: null, release: null, error: '' };
    if (catalog.length) Object.assign(row, { crossReferences: [], crossReferenceStatus: 'ok', referencesCapped: false });
    const reference = (kind, url, date, label, text) => {
      if (!catalog.length || Date.parse(date) < Date.parse(row.windowStart) || Date.parse(date) > now().getTime()) return;
      for (const target of referencedRepos(text, repo, catalog)) {
        const event = { source: repo, target, kind, url, date, label: String(label || kind).slice(0, 160) };
        event.id = Model.referenceId(event);
        if (!row.crossReferences.some(item => item.id === event.id)) row.crossReferences.push(event);
      }
    };
    if (info.size !== 0) {
      try {
        const commits = await request(`/commits?sha=${encodeURIComponent(info.default_branch)}&per_page=100`);
        if (!Array.isArray(commits) || commits.length > 100) throw new Error('Invalid public commit sample.');
        for (const commit of commits) {
          if (!Number.isFinite(Date.parse(commit.commit?.committer?.date))) throw new Error('Invalid commit timestamp.');
        }
        row.commits7d = commits.filter(c => Date.parse(c.commit.committer.date) >= Date.parse(row.windowStart) &&
          Date.parse(c.commit.committer.date) <= now().getTime()).length;
        row.capped = commits.length === 100;
        if (commits[0]) row.latestCommit = { sha: commits[0].sha, date: commits[0].commit.committer.date, url: commits[0].html_url };
        for (const commit of commits) reference('commit', commit.html_url, commit.commit.committer.date,
          `Commit ${commit.sha.slice(0, 7)}`, commit.commit.message || '');
        if (catalog.length) row.referencesCapped = row.capped;
      } catch (error) {
        row.status = 'partial';
        row.error = `Commit sample unavailable: ${error.message}`;
        if (catalog.length) row.crossReferenceStatus = 'partial';
      }
    }
    try {
      const release = await request('/releases/latest', { optional: true });
      if (release) {
        row.release = { tag: release.tag_name, publishedAt: release.published_at, url: release.html_url };
        reference('release', release.html_url, release.published_at, `Release ${release.tag_name}`, release.body || '');
        const assets = release.assets || [];
        const asset = name => {
          const url = assets.find(a => a.name === name)?.browser_download_url;
          const prefix = `https://github.com/${repo}/releases/download/`.toLowerCase();
          if (url && Supporters.httpsUrl(url) && url.toLowerCase().startsWith(prefix)) return url;
          return null;
        };
        if (['supporter-release.json', 'supporter-metadata.json', 'supporter-evidence.json', 'supporter-front.png', 'supporter-back.png'].every(asset)) {
          try {
            const [manifest, metadata, evidence] = await Promise.all(
              ['supporter-release.json', 'supporter-metadata.json', 'supporter-evidence.json'].map(name => request(asset(name), { asset: true })));
            const mint = evidence.mint || evidence;
            const chain = Supporters.CHAINS[mint.chainId];
            if (Supporters.normalizeRepo(manifest.repo) !== repo || manifest.version !== release.tag_name ||
                Supporters.normalizeRepo(metadata.properties?.repo) !== repo || metadata.properties.version !== release.tag_name ||
                manifest.front !== metadata.image || manifest.back !== metadata.properties.back_image ||
                !chain || mint.nftContract?.toLowerCase() !== chain.nft.toLowerCase() ||
                !/^\d+$/.test(mint.tokenId) || !manifest.metadataURI?.startsWith('ipfs://')) {
              throw new Error('Release manifest, metadata and mint evidence disagree.');
            }
            row.release.supporter = { chainId: mint.chainId, contract: mint.nftContract, tokenId: mint.tokenId,
              metadataURI: manifest.metadataURI, front: asset('supporter-front.png'), back: asset('supporter-back.png') };
          } catch (error) {
            row.error += `${row.error ? ' ' : ''}Supporter release artwork unavailable: ${error.message}`;
          }
        }
      }
    } catch (error) {
      row.status = 'partial';
      row.error += `${row.error ? ' ' : ''}Release check unavailable: ${error.message}`;
      if (catalog.length) row.crossReferenceStatus = 'partial';
    }
    if (catalog.length) {
      try {
        const issues = await request(`/issues?state=all&sort=updated&direction=desc&per_page=30&since=${encodeURIComponent(row.windowStart)}`);
        if (!Array.isArray(issues) || issues.length > 30) throw new Error('Invalid public issue/PR sample.');
        row.referencesCapped ||= issues.length === 30;
        for (const issue of issues) {
          if (!Number.isFinite(Date.parse(issue.updated_at))) throw new Error('Invalid issue/PR update time.');
          reference(issue.pull_request ? 'pull-request' : 'issue', issue.html_url, issue.updated_at,
            `${issue.pull_request ? 'PR' : 'Issue'} #${issue.number}`, `${issue.title || ''}\n${issue.body || ''}`);
        }
      } catch (error) {
        row.crossReferenceStatus = 'partial';
        row.error += `${row.error ? ' ' : ''}Cross-project issue/PR sample unavailable: ${error.message}`;
      }
      row.crossReferences.sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || a.id.localeCompare(b.id));
      row.referencesCapped ||= row.crossReferences.length > 100;
      row.crossReferences = row.crossReferences.slice(0, 100);
    }
    Model.validate({ version: 1, generatedAt: attemptedAt, repositories: [row] });
    return row;
  } catch (error) {
    return { repo, status: 'unavailable', attemptedAt, error: error.message };
  }
}

export async function main() {
  const [agency, creators, details] = await Promise.all(['data/agency-map.json', 'data/decent-creators.json', 'data/project-details.json'].map(read));
  const catalog = buildCatalog(agency, creators, details);
  const repositories = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, catalog.length) }, async () => {
    while (cursor < catalog.length) {
      const { repo } = catalog[cursor++];
      const row = await collect(repo, { catalog });
      await cacheArtwork(row);
      repositories.push(row);
      console.log(`${repo}: ${row.status}${row.error ? ` — ${row.error}` : ''}`);
    }
  }));
  repositories.sort((a, b) => a.repo.localeCompare(b.repo));
  const publicRepos = new Set(repositories.filter(row => row.status !== 'unavailable').map(row => row.repo));
  for (const row of repositories) {
    if (row.crossReferences) row.crossReferences = row.crossReferences.filter(event => publicRepos.has(event.target));
  }
  const data = Model.validate({ version: 1, generatedAt: new Date().toISOString(), repositories });
  await fs.writeFile(new URL('data/repository-activity.json', ROOT), JSON.stringify(data, null, 2) + '\n');
  if (repositories.every(row => row.status === 'unavailable')) {
    throw new Error('Every public repository read failed; unavailable snapshot written, no live activity claimed.');
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
