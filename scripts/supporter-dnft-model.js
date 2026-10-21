(function (root) {
  'use strict';
  const MARKET = 'https://thejollylama.github.io/DecentMarket/';
  const CHAINS = {
    10: { name: 'Optimism', explorer: 'https://optimistic.etherscan.io', nft: '0xe870f7b1D10C41dbc6b75598a5308B9a2Bb52958', escrow: '0x23A457AD3C33d68E4fAd2FCa7c5d9a511E0C350e', usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', rpcs: ['https://mainnet.optimism.io', 'https://optimism-rpc.publicnode.com'] },
    8453: { name: 'Base', explorer: 'https://basescan.org', nft: '0xe63EC9f8228720bAAC2fD528C0A6d06B3Dc5439B', escrow: '0x31b07b83e99A9bdF379bf40225b8A80d3804C89d', usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', rpcs: ['https://mainnet.base.org', 'https://base-rpc.publicnode.com'] }
  };
  const address = value => /^0x[\da-f]{40}$/i.test(value || '');
  const digits = value => typeof value === 'string' && /^\d+$/.test(value);
  function httpsUrl(value) {
    try {
      const u = new URL(value);
      return u.protocol === 'https:' && !u.username && !u.password ? u.href : '';
    } catch { return ''; }
  }
  function mediaUrl(value) {
    if (typeof value !== 'string') return '';
    if (value.startsWith('ipfs://')) value = 'https://ipfs.io/ipfs/' + value.slice(7).replace(/^ipfs\//, '');
    return httpsUrl(value);
  }
  function normalizeRepo(value) {
    if (typeof value !== 'string') return '';
    try {
      const u = new URL(value.includes('://') ? value : `https://github.com/${value}`);
      if (u.protocol !== 'https:' || u.hostname.toLowerCase() !== 'github.com' || u.username || u.password) return '';
      const parts = u.pathname.replace(/\/+$/, '').replace(/\.git$/i, '').split('/').filter(Boolean);
      return parts.length === 2 && parts.every(p => /^[\w.-]+$/.test(p) && p !== '.' && p !== '..') ? parts.join('/').toLowerCase() : '';
    } catch { return ''; }
  }
  const words = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  function mentions(text, name) {
    const n = words(name);
    return n.length >= 3 && (` ${words(text)} `).includes(` ${n} `);
  }
  function isSupporter(metadata, note = '') {
    return /\bsupporter\b/i.test([metadata.name, metadata.description, metadata.properties?.type, metadata.properties?.category, note].filter(v => typeof v === 'string').join(' '));
  }
  function matchProjects(metadata, catalog) {
    const p = metadata.properties || {};
    const repo = normalizeRepo(p.repo);
    // Explicit repository identity wins over project/name guesses, including unknown repositories.
    if (repo) return [{ repo, name: catalog.find(c => c.repo === repo)?.name || repo.split('/')[1], matchedBy: 'properties.repo' }];
    const project = typeof p.project === 'string' ? p.project : '';
    const projectRepo = normalizeRepo(project);
    if (projectRepo) return [{ repo: projectRepo, name: catalog.find(c => c.repo === projectRepo)?.name || projectRepo.split('/')[1], matchedBy: 'properties.project' }];
    const find = (text, exact) => catalog.filter(c => [c.name, c.repo.split('/')[1], ...(c.aliases || [])].some(n => exact ? words(text) === words(n) : mentions(text, n)));
    const explicit = project ? find(project, true) : [];
    const matches = explicit.length ? explicit : find([metadata.name, metadata.description].filter(v => typeof v === 'string').join(' '), false);
    return matches.map(c => ({ repo: c.repo, name: c.name, ...(c.aliases?.length ? { aliases: c.aliases } : {}), matchedBy: explicit.length ? 'properties.project' : 'name/description' }));
  }
  function tokenKey(token) { return `${token.chainId}:${token.contract.toLowerCase()}:${token.tokenId}`; }
  function listingUrl(token, listing) {
    const u = new URL(MARKET);
    u.search = new URLSearchParams({ chainId: token.chainId, nftContract: token.contract, tokenId: token.tokenId, ...(listing ? { listingId: listing.id } : {}) }).toString();
    return u.href;
  }
  function indexTokens(tokens) {
    const byProject = Object.create(null), byCreator = Object.create(null);
    const add = (index, key, id) => { if (key) { index[key] ||= []; if (!index[key].includes(id)) index[key].push(id); } };
    for (const t of tokens) {
      for (const p of t.projects) add(byProject, p.repo, t.id);
      if (t.creator) add(byCreator, t.creator.toLowerCase(), t.id);
      for (const github of t.creatorGithub || []) add(byCreator, `github:${github.toLowerCase()}`, t.id);
    }
    return { byProject, byCreator };
  }
  function validateSnapshot(data) {
    if (data?.version !== 1 || !Array.isArray(data.tokens) || !data.chains || typeof data.generatedAt !== 'string' || !Number.isFinite(Date.parse(data.generatedAt))) throw new Error('Invalid Supporter DNFT snapshot');
    for (const id of Object.keys(CHAINS)) {
      if (!['ok', 'partial', 'unavailable', 'stale'].includes(data.chains[id]?.status)) throw new Error('Invalid chain status');
    }
    const ids = new Set();
    for (const t of data.tokens) {
      if (!CHAINS[t.chainId] || !address(t.contract) || !digits(t.tokenId) || t.id !== tokenKey(t) || ids.has(t.id) || typeof t.name !== 'string' || !Array.isArray(t.projects) || !Array.isArray(t.listings) || (t.creator !== null && !address(t.creator)) || ![t.maxSupply, t.totalMinted].every(v => v === null || digits(v)) || (t.image !== '' && !mediaUrl(t.image))) throw new Error('Invalid Supporter DNFT token');
      ids.add(t.id);
      for (const p of t.projects) if (!p.repo || normalizeRepo(p.repo) !== p.repo || typeof p.name !== 'string') throw new Error('Invalid project match');
      for (const l of t.listings) if (!digits(l.id) || !digits(l.available) || !digits(l.priceAmount) || !digits(l.priceETH) || !address(l.priceToken) || typeof l.active !== 'boolean' || typeof l.currency !== 'string' || typeof l.price !== 'string') throw new Error('Invalid escrow listing');
      if (t.creatorGithub !== undefined && (!Array.isArray(t.creatorGithub) || t.creatorGithub.some(g => !/^[a-z\d-]+$/i.test(g)))) throw new Error('Invalid GitHub identity');
    }
    const indices = indexTokens(data.tokens);
    for (const key of ['byProject', 'byCreator']) if (JSON.stringify(data[key]) !== JSON.stringify(indices[key])) throw new Error(`Invalid ${key} index`);
    return data;
  }
  const api = { MARKET, CHAINS, address, httpsUrl, mediaUrl, normalizeRepo, mentions, isSupporter, matchProjects, tokenKey, listingUrl, indexTokens, validateSnapshot };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CanopySupporterModel = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
