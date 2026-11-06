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
      if (parts.length !== 2 || !parts.every(p => /^[\w.-]+$/.test(p) && p !== '.' && p !== '..')) return '';
      const repo = parts.join('/').toLowerCase();
      return repo === 'thejollylama/asteroid' ? 'thejollylama/decentvoyager' : repo;
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
  function tokenName(token) {
    if (token.chainId === 8453 && token.contract.toLowerCase() === CHAINS[8453].nft.toLowerCase() &&
        token.tokenId === '80' && /^TheJollyLaMa\/AsteRoid v1\.0\.0 Supporter DNFT$/i.test(token.name)) {
      return 'Decent Voyager v1.0.0 Supporter DNFT';
    }
    return token.name;
  }
  function checkoutSupported(token, listing) {
    const config = CHAINS[8453];
    return token.chainId === 8453 && token.contract.toLowerCase() === config.nft.toLowerCase()
      && listing?.active && BigInt(listing.available) > 0n && listing.priceETH === '0'
      && listing.priceToken.toLowerCase() === config.usdc.toLowerCase()
      && ['10000000', '100000000'].includes(listing.priceAmount);
  }
  function listingUrl(token, listing) {
    const buy = listing && checkoutSupported(token, listing);
    const u = new URL(buy ? 'supporter/buy.html' : '', MARKET);
    u.search = new URLSearchParams(buy
      ? { chainId: token.chainId, escrow: CHAINS[token.chainId].escrow, listingId: listing.id, priceUSDC: listing.priceAmount }
      : { chainId: token.chainId, nftContract: token.contract, tokenId: token.tokenId }).toString();
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
  function releaseDate(token, activity) {
    const row = activity?.repositories?.find(row => {
      const s = row.release?.supporter;
      return row.status !== 'unavailable' && s && s.chainId === token.chainId && s.contract.toLowerCase() === token.contract.toLowerCase()
        && s.tokenId === token.tokenId && mediaUrl(s.metadataURI) === mediaUrl(token.metadataUri);
    });
    const date = row?.release?.publishedAt || token.properties?.release_date;
    return typeof date === 'string' && Number.isFinite(Date.parse(date)) ? Date.parse(date) : 0;
  }
  function selectTokens(tokens, query = '', activity) {
    const terms = words(query).split(' ').filter(Boolean);
    return tokens.filter(token => {
      const text = words([tokenName(token), token.description, CHAINS[token.chainId].name, token.tokenId,
        token.listings.some(l => checkoutSupported(token, l)) ? 'available purchase listed' : 'legacy unavailable checkout',
        ...token.projects.flatMap(p => [p.name, p.repo, ...(p.aliases || [])]),
        ...['type', 'category', 'version'].map(k => token.properties?.[k])].join(' '));
      return terms.every(term => text.includes(term));
    }).slice().sort((a, b) => releaseDate(b, activity) - releaseDate(a, activity)
      || (a.chainId === b.chainId && a.contract.toLowerCase() === b.contract.toLowerCase()
        ? (BigInt(a.tokenId) < BigInt(b.tokenId) ? 1 : BigInt(a.tokenId) > BigInt(b.tokenId) ? -1 : 0)
        : a.id.localeCompare(b.id)));
  }
  async function readHoldings(data, wallet, ethers) {
    validateSnapshot(data);
    if (!address(wallet)) throw new Error('A valid public wallet is required to read Supporter holdings.');
    if (!ethers?.JsonRpcProvider || !ethers?.Contract) throw new Error('Wallet balance reader unavailable. Reload or retry.');
    const groups = new Map(), holdings = [], errors = [], observations = [];
    for (const token of data.tokens) {
      const key = `${token.chainId}:${token.contract.toLowerCase()}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(token);
    }
    for (const tokens of groups.values()) {
      const { chainId, contract } = tokens[0], config = CHAINS[chainId];
      let success = false;
      for (const url of config.rpcs) {
        const request = new ethers.FetchRequest(url); request.timeout = 12000;
        const provider = new ethers.JsonRpcProvider(request, undefined, { batchMaxCount: 1 });
        try {
          if ((await provider.getNetwork()).chainId !== BigInt(chainId)) throw new Error('Wrong balance network');
          const block = await provider.getBlockNumber();
          const nft = new ethers.Contract(contract, ['function balanceOfBatch(address[],uint256[]) view returns (uint256[])'], provider);
          const result = [];
          for (let offset = 0; offset < tokens.length; offset += 64) {
            const batch = tokens.slice(offset, offset + 64);
            const balances = await nft.balanceOfBatch(batch.map(() => wallet), batch.map(t => t.tokenId), { blockTag: block });
            if (balances.length !== batch.length || balances.some(n => typeof n !== 'bigint' || n < 0n)) throw new Error('Invalid balance response');
            batch.forEach((token, i) => { if (balances[i] > 0n) result.push({ token, quantity: String(balances[i]), block }); });
          }
          holdings.push(...result); observations.push({ chainId, contract, block }); success = true; break;
        } catch { /* Retry this contract on the next configured public RPC; failed groups remain explicitly unknown. */ }
        finally { provider.destroy(); }
      }
      if (!success) errors.push(`${config.name} ${contract}: balances unavailable; not zero.`);
    }
    return { wallet: wallet.toLowerCase(), holdings, errors, observations, checkedAt: new Date().toISOString() };
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
  const api = { MARKET, CHAINS, address, httpsUrl, mediaUrl, normalizeRepo, mentions, isSupporter, matchProjects, tokenKey, tokenName, listingUrl, checkoutSupported, indexTokens, validateSnapshot, releaseDate, selectTokens, readHoldings };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CanopySupporterModel = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
