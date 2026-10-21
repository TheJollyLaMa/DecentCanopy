import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import Model from './supporter-dnft-model.js';

const require = createRequire(new URL('../relay/package.json', import.meta.url));
const ROOT = new URL('../', import.meta.url);
const read = async name => JSON.parse(await fs.readFile(new URL(name, ROOT), 'utf8'));
const NFT_ABI = ['function nextTokenId() view returns (uint256)', 'function uri(uint256) view returns (string)', 'function totalMinted(uint256) view returns (uint256)', 'function maxSupply(uint256) view returns (uint256)', 'function creatorOf(uint256) view returns (address)', 'function kindOf(uint256) view returns (uint8)'];
const ESCROW_ABI = ['function nextListingId() view returns (uint256)', 'function getListing(uint256) view returns (tuple(address nftContract, uint256 tokenId, uint256 priceETH, address priceToken, uint256 priceAmount, uint256 available, bool active, string note))', 'function getNFTBalance(address nftContract, uint256 tokenId) view returns (uint256)'];
const ZERO = '0x0000000000000000000000000000000000000000';

export function buildCatalog(agency, creators, details) {
  const catalog = new Map();
  const add = (repo, name) => {
    repo = Model.normalizeRepo(repo);
    if (!repo) return;
    if (!catalog.has(repo)) catalog.set(repo, { repo, name, aliases: [] });
    const row = catalog.get(repo);
    if (name && name !== row.name && !row.aliases.includes(name)) row.aliases.push(name);
  };
  for (const p of agency.projects || []) if (p.repo) add(p.repo, p.name);
  for (const p of details.projects || []) add(p.repoUrl, p.name);
  for (const c of creators.creators || []) for (const p of c.record.projects || []) {
    for (const repo of p.repositories || []) add(repo, p.name);
    try {
      const url = new URL(p.website);
      if (url.hostname.endsWith('.github.io')) add(`${url.hostname.split('.')[0]}/${url.pathname.split('/').filter(Boolean)[0]}`, p.name);
    } catch { /* A project website is optional. */ }
  }
  for (const c of creators.creators || []) for (const p of c.record.projects || []) {
    const candidates = [...catalog.values()].filter(row => Model.mentions(row.repo.split('/')[1], p.name));
    // A unique whole-word public project name can supply an alias (e.g. BigNuten / BigNuten_Vanilla).
    if (candidates.length === 1) add(candidates[0].repo, p.name);
  }
  return [...catalog.values()];
}

async function mapLimit(items, limit, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  }));
}

async function metadata(uri, tokenId) {
  uri = uri.replace(/\{id\}/g, BigInt(tokenId).toString(16).padStart(64, '0'));
  if (uri.startsWith('data:application/json')) {
    const [header, body] = uri.split(/,(.*)/s);
    if (body.length > 2_000_000) throw new Error('Metadata too large');
    return JSON.parse(header.includes(';base64') ? Buffer.from(body, 'base64').toString() : decodeURIComponent(body));
  }
  const urls = uri.startsWith('ipfs://')
    ? ['https://ipfs.io/ipfs/', 'https://gateway.pinata.cloud/ipfs/'].map(g => g + uri.slice(7).replace(/^ipfs\//, ''))
    : [Model.httpsUrl(uri)];
  for (const url of urls.filter(Boolean)) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(12_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      if (text.length > 2_000_000) throw new Error('Metadata too large');
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid metadata');
      return data;
    } catch { /* Try the next public IPFS gateway. */ }
  }
  throw new Error('Metadata unavailable from public gateways');
}

export async function scan(chainId, config, catalog, previous, dependencies = {}) {
  const { Contract, JsonRpcProvider, FetchRequest, formatUnits } = dependencies.ethers || require('ethers');
  const providers = dependencies.call ? [] : (process.env[`SUPPORTER_RPC_${chainId}`]?.split(',') || config.rpcs).map(url => {
    const request = new FetchRequest(url.trim());
    request.timeout = 12_000;
    return new JsonRpcProvider(request, Number(chainId), { staticNetwork: true, batchMaxCount: 1 });
  });
  let preferred = 0;
  const call = dependencies.call || (async (contract, abi, method, ...args) => {
    let error;
    for (let i = 0; i < providers.length; i++) {
      const index = (preferred + i) % providers.length;
      try {
        const result = await new Contract(contract, abi, providers[index])[method](...args);
        preferred = index;
        return result;
      } catch (e) { error = e; }
    }
    throw error;
  });
  const bounded = n => { if (n > 10000n) throw new Error('Registry exceeds 10,000 entries; increase scan limit deliberately'); return Number(n); };
  const issues = [];
  try {
    // Enumerate registry and escrow IDs from zero, with bounded gateway concurrency below.
    const count = bounded(await call(config.nft, NFT_ABI, 'nextTokenId'));
    const listingCount = bounded(await call(config.escrow, ESCROW_ABI, 'nextListingId'));
    console.log(`${config.name}: reading ${count} registered tokens and ${listingCount} escrow listings`);
    const listings = new Map();
    for (let i = 0; i < listingCount; i++) {
      const l = await call(config.escrow, ESCROW_ABI, 'getListing', i);
      const key = `${l.nftContract.toLowerCase()}:${l.tokenId}`;
      let available = 0n;
      if (l.active && l.available > 0n) available = await call(config.escrow, ESCROW_ABI, 'getNFTBalance', l.nftContract, l.tokenId);
      const stock = available < l.available ? available : l.available;
      const usdc = l.priceToken.toLowerCase() === config.usdc.toLowerCase();
      const eth = l.priceToken === ZERO;
      const listing = { id: String(i), active: l.active, available: String(stock), priceETH: String(l.priceETH), ethPrice: formatUnits(l.priceETH, 18), priceToken: l.priceToken, priceAmount: String(l.priceAmount), currency: eth ? 'ETH' : usdc ? 'USDC' : l.priceToken, price: eth ? formatUnits(l.priceETH, 18) : usdc ? formatUnits(l.priceAmount, 6) : `${l.priceAmount} base units`, note: l.note };
      if (!listings.has(key)) listings.set(key, []);
      listings.get(key).push(listing);
    }
    const candidates = new Set(Array.from({ length: count }, (_, id) => `${config.nft.toLowerCase()}:${id}`));
    for (const key of listings.keys()) candidates.add(key);
    const tokens = [];
    await mapLimit([...candidates], 3, async key => {
      const [contract, tokenId] = key.split(':');
      try {
        // Skip achievement editions before gateway reads; external ERC-1155s may omit v0.2 helpers.
        const optional = async method => {
          try { return await call(contract, NFT_ABI, method, tokenId); }
          catch (error) { if (contract === config.nft.toLowerCase()) throw error; return null; }
        };
        const kind = await optional('kindOf');
        if (kind === 1n) return;
        const uri = await call(contract, NFT_ABI, 'uri', tokenId);
        const offers = listings.get(key) || [];
        let m, metadataStatus = 'ok';
        try { m = await (dependencies.metadata || metadata)(uri, tokenId); }
        catch {
          const old = previous.find(t => `${t.contract.toLowerCase()}:${t.tokenId}` === key);
          const note = offers.find(l => Model.isSupporter({}, l.note))?.note;
          if (!old && !note) throw new Error('Metadata unavailable and no Supporter listing note');
          m = old ? { name: old.name, description: old.description, image: old.image, properties: old.properties }
            : { name: note, description: 'Name from on-chain escrow listing note; token metadata unavailable.' };
          metadataStatus = old ? 'stale' : 'unavailable';
          issues.push(`Token ${key}: metadata unavailable; ${old ? 'previous metadata' : 'on-chain listing note'} used`);
        }
        if (!Model.isSupporter(m, offers.map(l => l.note).join(' '))) return;
        const creator = await optional('creatorOf');
        const totalMinted = await optional('totalMinted');
        const maxSupply = await optional('maxSupply');
        const token = { metadataStatus, chainId: Number(chainId), contract, tokenId, name: typeof m.name === 'string' ? m.name : `Supporter DNFT #${tokenId}`, description: typeof m.description === 'string' ? m.description : '', image: Model.mediaUrl(m.image), metadataUri: Model.mediaUrl(uri), creator: creator === ZERO ? null : creator, totalMinted: totalMinted === null ? null : String(totalMinted), maxSupply: maxSupply === null ? null : String(maxSupply), projects: Model.matchProjects(m, catalog), listings: offers, properties: m.properties && typeof m.properties === 'object' ? m.properties : {}, observedAt: new Date().toISOString() };
        token.id = Model.tokenKey(token);
        tokens.push(token);
        console.log(`${config.name}: ${JSON.stringify(token.name)} (#${tokenId}) → ${token.projects.map(p => p.repo).join(', ') || 'creator only'}`);
      } catch {
        issues.push(`Token ${key}: metadata or contract reads unavailable`);
        console.warn(`${config.name}: token ${key} unavailable`);
        const old = previous.find(t => `${t.contract.toLowerCase()}:${t.tokenId}` === key);
        if (old) tokens.push({ ...old, stale: true });
      }
    });
    tokens.sort((a, b) => a.id.localeCompare(b.id));
    issues.sort();
    return { tokens, status: issues.length ? 'partial' : 'ok', registered: count, listings: listingCount, issues };
  } finally { providers.forEach(p => p.destroy()); }
}

export async function main() {
  const [agency, creators, details] = await Promise.all(['data/agency-map.json', 'data/decent-creators.json', 'data/project-details.json'].map(read));
  const catalog = buildCatalog(agency, creators, details);
  let previous;
  try { previous = Model.validateSnapshot(await read('data/supporter-dnfts.json')); } catch { previous = { tokens: [] }; }
  const tokens = [], chains = {};
  for (const [chainId, config] of Object.entries(Model.CHAINS)) {
    const old = previous.tokens.filter(t => t.chainId === Number(chainId));
    try {
      const result = await scan(chainId, config, catalog, old);
      tokens.push(...result.tokens);
      const { tokens: ignored, ...status } = result;
      chains[chainId] = { ...status, attemptedAt: new Date().toISOString() };
    } catch {
      tokens.push(...old.map(t => ({ ...t, stale: true })));
      chains[chainId] = { status: old.length ? 'stale' : 'unavailable', attemptedAt: new Date().toISOString(), issues: ['Public RPC registry/escrow scan failed; previous data retained if available.'] };
    }
    console.log(`${config.name}: ${chains[chainId].status}, ${tokens.filter(t => t.chainId === Number(chainId)).length} Supporter DNFTs`);
  }
  // A creator's own GitHub profile URL is a self-declared discovery link, never an ownership claim.
  for (const t of tokens) {
    t.creatorGithub = [];
    for (const c of creators.creators || []) {
      if (c.record.wallet.toLowerCase() !== t.creator?.toLowerCase()) continue;
      try {
        const url = new URL(c.record.website);
        if (url.hostname === 'github.com' && /^\/[a-z\d-]+\/?$/i.test(url.pathname)) t.creatorGithub.push(url.pathname.replace(/\//g, '').toLowerCase());
      } catch { /* No self-declared GitHub profile. */ }
    }
  }
  const data = { version: 1, generatedAt: new Date().toISOString(), chains, tokens, ...Model.indexTokens(tokens) };
  Model.validateSnapshot(data);
  await fs.writeFile(new URL('data/supporter-dnfts.json', ROOT), JSON.stringify(data, null, 2) + '\n');
  console.log('Tokens per project:', Object.fromEntries(Object.entries(data.byProject).map(([repo, ids]) => [repo, ids.length])));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
