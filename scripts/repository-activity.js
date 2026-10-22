(function (root) {
  'use strict';
  const Repos = typeof module !== 'undefined' && module.exports
    ? require('./supporter-dnft-model') : root.CanopySupporterModel;
  const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
  const STALE_MS = 60 * 60 * 1000;
  const LEVELS = {
    unknown: { color: '#94a3b8', label: 'Unknown / stale' },
    quiet: { color: '#64748b', label: '0 sampled commits' },
    low: { color: '#38bdf8', label: '1–4 commits' },
    medium: { color: '#fbbf24', label: '5–19 commits' },
    high: { color: '#fb7185', label: '20+ commits' }
  };
  const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const repoLink = (url, repo, suffix) => Repos.httpsUrl(url) &&
    url.toLowerCase().startsWith(`https://github.com/${repo}/${suffix}`);
  function validate(data) {
    if (data?.version !== 1 || !date(data.generatedAt) || !Array.isArray(data.repositories)) {
      throw new Error('Invalid public repository activity snapshot.');
    }
    const seen = new Set();
    for (const row of data.repositories) {
      if (!row.repo || Repos.normalizeRepo(row.repo) !== row.repo || seen.has(row.repo) ||
          !['ok', 'partial', 'unavailable'].includes(row.status) || !date(row.attemptedAt) ||
          typeof row.error !== 'string') throw new Error('Invalid repository activity record.');
      seen.add(row.repo);
      if (row.status === 'unavailable') continue;
      const countValid = row.commits7d === null ? row.status === 'partial'
        : Number.isInteger(row.commits7d) && row.commits7d >= 0 && row.commits7d <= 100;
      if (!date(row.checkedAt) || !date(row.windowStart) || !countValid || typeof row.capped !== 'boolean' ||
          typeof row.defaultBranch !== 'string' || typeof row.archived !== 'boolean' ||
          !Number.isInteger(row.openIssuesAndPRs) || row.openIssuesAndPRs < 0) {
        throw new Error('Invalid repository activity metrics.');
      }
      if (row.latestCommit && (!/^[a-f0-9]{40}$/i.test(row.latestCommit.sha) ||
          !date(row.latestCommit.date) || !repoLink(row.latestCommit.url, row.repo, 'commit/'))) {
        throw new Error('Invalid repository commit evidence.');
      }
      if (row.release && (!date(row.release.publishedAt) || typeof row.release.tag !== 'string' ||
          !repoLink(row.release.url, row.repo, 'releases/tag/'))) throw new Error('Invalid release evidence.');
      if (row.release?.supporter) {
        const s = row.release.supporter;
        const chain = Repos.CHAINS[s.chainId];
        const assetPrefix = `https://github.com/${row.repo}/releases/download/`.toLowerCase();
        if (!chain || s.contract?.toLowerCase() !== chain.nft.toLowerCase() ||
            !/^\d+$/.test(s.tokenId) || typeof s.metadataURI !== 'string' ||
            !s.metadataURI.startsWith('ipfs://') ||
            ![s.front, s.back].every(url => Repos.httpsUrl(url) && url.toLowerCase().startsWith(assetPrefix))) {
          throw new Error('Invalid official Supporter release mirror.');
        }
        if (['frontPreview', 'backPreview'].some(key => s[key] !== undefined &&
            !/^assets\/supporter-releases\/[a-f0-9]{24}\/(?:front|back)\.png$/.test(s[key]))) {
          throw new Error('Invalid local Supporter artwork preview.');
        }
      }
    }
    return data;
  }
  function heat(row, now = Date.now()) {
    if (!row || row.status !== 'ok' || !date(row.checkedAt) ||
        now - Date.parse(row.checkedAt) > STALE_MS || Date.parse(row.checkedAt) > now + 60000) return 'unknown';
    return row.commits7d === 0 ? 'quiet' : row.commits7d < 5 ? 'low' : row.commits7d < 20 ? 'medium' : 'high';
  }
  function repositoriesForNode(node) {
    const project = node.creatorRecord?.projects?.find(p => p.key === node.creatorProjectKey);
    return [...new Set([node.repoUrl, node.projectDetails?.repoUrl, ...(project?.repositories || [])]
      .map(Repos.normalizeRepo).filter(Boolean))];
  }
  function forNode(data, node) {
    const repos = new Set(repositoriesForNode(node));
    return data?.repositories.filter(row => repos.has(row.repo)) || [];
  }
  function nodeHeat(data, node, now = Date.now()) {
    const rows = forNode(data, node);
    if (!rows.length || rows.length !== repositoriesForNode(node).length ||
        rows.some(row => heat(row, now) === 'unknown')) return 'unknown';
    const sum = rows.reduce((n, row) => n + row.commits7d, 0);
    return sum === 0 ? 'quiet' : sum < 5 ? 'low' : sum < 20 ? 'medium' : 'high';
  }
  function edgeHeat(data, source, target, now = Date.now()) {
    const a = nodeHeat(data, source, now), b = nodeHeat(data, target, now);
    return { source: a, target: b, activeTogether: !['unknown', 'quiet'].includes(a) && !['unknown', 'quiet'].includes(b) };
  }
  function releaseMirror(data, token) {
    const uri = value => value?.replace(/^https:\/\/(?:ipfs\.io|gateway\.pinata\.cloud)\/ipfs\//, 'ipfs://');
    for (const row of data?.repositories || []) {
      const mirror = row.release?.supporter;
      if (row.status !== 'unavailable' && mirror && mirror.chainId === token.chainId &&
          mirror.contract.toLowerCase() === token.contract.toLowerCase() && mirror.tokenId === token.tokenId &&
          uri(mirror.metadataURI) === uri(token.metadataUri)) return mirror;
    }
    return null;
  }
  const api = { WINDOW_MS, STALE_MS, LEVELS, validate, heat, repositoriesForNode, forNode, nodeHeat, edgeHeat, releaseMirror };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CanopyRepositoryActivity = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
