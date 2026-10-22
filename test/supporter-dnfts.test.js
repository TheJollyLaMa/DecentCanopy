'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const M = require('../scripts/supporter-dnft-model');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const catalog = [{ repo: 'thejollylama/bignuten_vanilla', name: 'BigNuten' }, { repo: 'thejollylama/decentbusking', name: 'DecentBusking' }];
const wallet = '0x807061df657a7697c04045da7d16d941861caabc';
function fixture() {
  const token = { chainId: 8453, contract: M.CHAINS[8453].nft.toLowerCase(), tokenId: '0', name: 'BigNuten v2.0.0 Supporter DNFT', description: "O'Brien <img src=x onerror=alert(1)>", creator: wallet, totalMinted: '1000', maxSupply: '1000', projects: [{ ...catalog[0], matchedBy: 'properties.repo' }], image: 'ipfs://bafyexample/art.png', properties: { license: 'Apache-2.0' }, listings: [{ id: '0', available: '995', active: true, priceETH: '0', priceToken: M.CHAINS[8453].usdc, priceAmount: '10000000', currency: 'USDC', price: '10.0' }], observedAt: '2026-10-21T00:00:00.000Z' };
  token.id = M.tokenKey(token);
  return { version: 1, generatedAt: '2026-10-21T00:00:00.000Z', chains: { 10: { status: 'ok' }, 8453: { status: 'ok' } }, tokens: [token], ...M.indexTokens([token]) };
}
function ui(data = fixture(), failure = false, extras = {}) {
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.listeners = {}; this.isConnected = true; }
    append(...nodes) { this.children.push(...nodes); }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(name, listener) { this.listeners[name] = listener; }
    querySelector() { return null; }
    remove() { this.removed = true; }
    set innerHTML(_) { throw new Error('Metadata must never enter innerHTML'); }
  }
  const document = { createElement: tag => new Element(tag), createTextNode: text => ({ textContent: text }) };
  const window = { CanopySupporterModel: M, ...extras };
  let requests = 0;
  vm.runInNewContext(read('scripts/supporter-dnfts.js'), { window, document, URL, BigInt, fetch: async () => { requests++; return { ok: !failure, json: async () => data }; } });
  const flatten = element => [element, ...(element.children || []).flatMap(flatten)];
  return { api: window.CanopySupporterDNFTs, container: new Element('div'), flatten, requests: () => requests };
}

test('repository matching normalizes GitHub identity and rejects lookalikes and unsafe schemes', () => {
  assert.equal(M.normalizeRepo('https://GitHub.com/TheJollyLaMa/BigNuten_Vanilla.git/'), catalog[0].repo);
  assert.equal(M.normalizeRepo('TheJollyLaMa/BigNuten_Vanilla'), catalog[0].repo);
  for (const url of ['https://github.com.evil.test/u/r', 'javascript:alert(1)', 'https://user@github.com/u/r', 'http://github.com/u/r', 'https://github.com/u/r/issues']) assert.equal(M.normalizeRepo(url), '');
});

test('S11 repo wins over conflicting project/name metadata; unknown repos remain indexed', () => {
  const metadata = { name: 'DecentBusking Supporter', properties: { repo: 'https://github.com/TheJollyLaMa/BigNuten_Vanilla', project: 'DecentBusking', version: 'v2.0.0', commit: 'abc', code_archive_cid: 'bafy', license: 'Apache-2.0' } };
  assert.deepEqual(M.matchProjects(metadata, catalog), [{ ...catalog[0], matchedBy: 'properties.repo' }]);
  assert.equal(M.matchProjects({ properties: { repo: 'https://github.com/new/project' } }, catalog)[0].repo, 'new/project');
});

test('project property, legacy name/description, and word boundaries avoid collection bleed', () => {
  assert.equal(M.matchProjects({ name: 'BigNuten Supporter', properties: { project: 'DecentBusking' } }, catalog)[0].repo, catalog[1].repo);
  assert.equal(M.matchProjects({ properties: { project: 'https://github.com/TheJollyLaMa/DecentBusking' } }, catalog)[0].matchedBy, 'properties.project');
  assert.equal(M.matchProjects({ name: 'BigNuten v2.0.0 Supporter DNFT (Eth)' }, catalog)[0].repo, catalog[0].repo);
  assert.equal(M.matchProjects({ description: 'DecentBusking founding supporter' }, catalog)[0].repo, catalog[1].repo);
  assert.deepEqual(M.matchProjects({ name: 'NotBigNuten Supporter' }, catalog), []);
  assert.ok(M.isSupporter({ name: 'BigNuten Supporter DNFT' }));
  assert.ok(M.isSupporter({ name: 'Founding edition' }, 'DecentBusking Supporter'));
  assert.equal(M.isSupporter({ name: 'Hydration achievement' }), false);
});

test('snapshot shape validates decimal IDs, cross-chain indexes, listings and incomplete empty data', () => {
  const data = fixture();
  assert.equal(M.validateSnapshot(data), data);
  const second = { ...data.tokens[0], chainId: 10 };
  second.id = M.tokenKey(second);
  data.tokens.push(second);
  Object.assign(data, M.indexTokens(data.tokens));
  assert.equal(M.validateSnapshot(data).byCreator[wallet].length, 2);
  for (const mutate of [d => { d.tokens[0].tokenId = 0; }, d => { d.tokens.push(d.tokens[0]); }, d => { d.byProject = {}; }, d => { d.chains[10].status = 'fine'; }, d => { d.tokens[0].listings[0].available = '-1'; }, d => { d.tokens[0].creator = 'bad'; }, d => { d.tokens[0].image = 'javascript:alert(1)'; }]) {
    const bad = structuredClone(data); mutate(bad); assert.throws(() => M.validateSnapshot(bad));
  }
  assert.doesNotThrow(() => M.validateSnapshot({ version: 1, generatedAt: data.generatedAt, chains: { 10: { status: 'unavailable' }, 8453: { status: 'unavailable' } }, tokens: [], ...M.indexTokens([]) }));
});

test('project/repo/creator selection does not leak all steward tokens onto unrelated projects', () => {
  const data = fixture(), { api } = ui(data);
  assert.equal(api.tokensForNode(data, { kind: 'repository', repoUrl: 'https://github.com/TheJollyLaMa/BigNuten_Vanilla' }).length, 1);
  assert.equal(api.tokensForNode(data, { kind: 'project', name: 'BigNuten' }).length, 1);
  assert.equal(api.tokensForNode(data, { kind: 'project', name: 'BigNuten', repoUrl: 'https://github.com/other/project' }).length, 0);
  assert.equal(api.tokensForNode(data, { kind: 'creator', creatorRecord: { wallet } }).length, 1);
  assert.equal(api.tokensForNode(data, { kind: 'project', name: 'DecentBusking', creatorRecord: { wallet, projects: [{ key: 'busking', repositories: ['https://github.com/TheJollyLaMa/DecentBusking'] }] }, creatorProjectKey: 'busking' }).length, 0);
});

test('coin details use text nodes for apostrophes/HTML and show stock, prices and ledger links', async () => {
  const { api, container, flatten, requests } = ui();
  api.mount(container, { kind: 'project', name: 'BigNuten' });
  await new Promise(resolve => setImmediate(resolve));
  const nodes = flatten(container), text = nodes.map(n => n.textContent || '').join(' ');
  assert.ok(text.includes("O'Brien <img src=x onerror=alert(1)>"));
  assert.ok(text.includes('Minted 1000 / 1000'));
  assert.ok(text.includes('10.0 USDC'));
  assert.ok(text.includes('Listing #0'));
  assert.ok(nodes.some(n => n.tagName === 'details'));
  const image = nodes.find(n => n.tagName === 'img');
  assert.equal(image.src, 'https://ipfs.io/ipfs/bafyexample/art.png');
  image.listeners.error(); assert.equal(image.removed, true);
  const support = nodes.find(n => n.tagName === 'a' && n.textContent.startsWith('Support'));
  assert.equal(new URL(support.href).pathname, '/DecentMarket/supporter/buy.html');
  assert.equal(new URL(support.href).searchParams.get('escrow'), M.CHAINS[8453].escrow);
  assert.equal(new URL(support.href).searchParams.get('listingId'), '0');
  assert.ok(nodes.some(n => n.href?.startsWith('https://basescan.org/token/')));
  await api.load(); assert.equal(requests(), 1);
});

test('matching official release mirrors show both artwork faces without changing ledger provenance or stock', async () => {
  const Activity = require('../scripts/repository-activity');
  const data = fixture(), token = data.tokens[0];
  token.metadataUri = 'https://ipfs.io/ipfs/Qmfixture';
  token.metadataStatus = 'unavailable';
  token.image = '';
  const activity = { repositories: [{ status: 'ok', release: { supporter: { chainId: 8453, contract: token.contract,
    tokenId: token.tokenId, metadataURI: 'ipfs://Qmfixture', front: 'https://github.com/maker/project/releases/download/v1/front.png',
    back: 'https://github.com/maker/project/releases/download/v1/back.png',
    frontPreview: `assets/supporter-releases/${'a'.repeat(24)}/front.png`,
    backPreview: `assets/supporter-releases/${'a'.repeat(24)}/back.png` } } }] };
  const view = ui(data, false, { CanopyRepositoryActivity: Activity, CanopyRepositoryActivityUI: { getData: () => activity } });
  view.api.mount(view.container, { kind: 'project', name: 'BigNuten' });
  await new Promise(resolve => setImmediate(resolve));
  const nodes = view.flatten(view.container);
  assert.equal(nodes.filter(n => n.tagName === 'img').length, 3);
  assert.ok(nodes.some(n => n.textContent?.includes('not a fresh IPFS retrieval')));
  assert.equal(token.metadataStatus, 'unavailable');
  assert.equal(token.listings[0].available, '995');
  assert.ok(nodes.some(n => n.tagName === 'details' && n.open));
});

test('unlisted, stale, failed-fetch, and late detached-panel states are honest and safe', async () => {
  const data = fixture();
  data.chains[8453].status = 'partial'; data.tokens[0].listings = [];
  const view = ui(data); view.api.mount(view.container, { kind: 'project', name: 'BigNuten' });
  await new Promise(resolve => setImmediate(resolve));
  const nodes = view.flatten(view.container), text = nodes.map(n => n.textContent || '').join(' ');
  assert.ok(text.includes('incomplete/unavailable'));
  assert.ok(text.includes('No available escrow listing'));
  assert.equal(nodes.filter(n => n.tagName === 'a' && n.textContent.startsWith('Support')).length, 0);
  const failed = ui(data, true); failed.api.mount(failed.container, { kind: 'project', name: 'BigNuten' });
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(failed.flatten(failed.container).some(n => n.textContent?.includes('snapshot unavailable')));
  const late = ui(); late.api.mount(late.container, { kind: 'project', name: 'BigNuten' }); late.container.children[0].isConnected = false;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(late.flatten(late.container).filter(n => n.tagName === 'details').length, 0);
});

test('bundled JSON, Pages, IPFS and all shared sidepanel paths retain Supporter DNFTs', () => {
  assert.doesNotThrow(() => M.validateSnapshot(JSON.parse(read('data/supporter-dnfts.json'))));
  const files = require('../scripts/siteFiles').listSiteFiles();
  for (const file of ['data/supporter-dnfts.json', 'scripts/supporter-dnft-model.js', 'scripts/supporter-dnfts.js', 'styles/supporter-dnfts.css']) assert.ok(files.includes(file));
  assert.ok(require('../scripts/pinDataBackup').DATA_FILES.includes('data/supporter-dnfts.json'));
  assert.match(read('scripts/spiral.js'), /showDetailsContent\(node\);\s*window\.CanopySupporterDNFTs\?\.mount\(detailsContentEl, node\)/);
  assert.match(read('styles/supporter-dnfts.css'), /prefers-reduced-motion/);
  assert.match(read('index.html'), /scripts\/supporter-dnft-model.js/);
  assert.match(read('.github/workflows/publish-site.yml'), /Refresh Supporter DNFTs/);
});

test('builder catalog reuses public repo identities and aliases without inferring wallet ownership', async () => {
  const { buildCatalog } = await import('../scripts/build-supporter-dnfts.mjs');
  const rows = buildCatalog({ projects: [{ repo: 'TheJollyLaMa/BigNuten_Vanilla', name: 'BigNuten' }] }, { creators: [{ record: { projects: [{ name: 'Big Nuten', repositories: ['https://github.com/TheJollyLaMa/BigNuten_Vanilla'] }, { name: 'DecentBusking', website: 'https://thejollylama.github.io/DecentBusking/' }, { name: 'BigNuten', website: 'https://bignuten.example.com' }, { name: 'Private', website: 'https://example.com' }] } }] }, { projects: [] });
  assert.deepEqual(rows[0].aliases, ['Big Nuten']);
  assert.equal(rows[1].repo, catalog[1].repo);
  assert.equal(rows.length, 2);
  const actual = buildCatalog(JSON.parse(read('data/agency-map.json')), JSON.parse(read('data/decent-creators.json')), JSON.parse(read('data/project-details.json')));
  assert.equal(M.matchProjects({ name: 'BigNuten v2.0.0 Supporter DNFT' }, actual)[0].repo, catalog[0].repo);
  const tokenData = fixture(); tokenData.tokens[0].projects = M.matchProjects({ name: 'BigNuten v2.0.0 Supporter DNFT' }, actual);
  assert.equal(ui(tokenData).api.tokensForNode(tokenData, { kind: 'project', name: 'BigNuten' }).length, 1);
});

test('scanner enumerates unlisted registry tokens and real escrow stock, skips achievements, and falls back to listing notes', async () => {
  const { scan } = await import('../scripts/build-supporter-dnfts.mjs');
  const calls = [];
  const config = M.CHAINS[8453];
  const ZERO = '0x0000000000000000000000000000000000000000';
  const deps = {
    ethers: { formatUnits: (n, decimals) => String(Number(n) / 10 ** decimals) },
    call: async (contract, abi, method, id) => {
      calls.push([method, String(id)]);
      switch (method) {
        case 'nextTokenId': return 4n;
        case 'nextListingId': return 2n;
        case 'getListing': return { nftContract: config.nft, tokenId: id === 0 ? 0n : 2n, priceETH: 5000000000000000n, priceToken: id === 0 ? config.usdc : ZERO, priceAmount: id === 0 ? 10000000n : 0n, available: 5n, active: id === 0, note: 'BigNuten Supporter DNFT' };
        case 'getNFTBalance': return 1n;
        case 'kindOf': return id === '1' ? 1n : 0n;
        case 'uri': return `ipfs://metadata${id}`;
        case 'creatorOf': return wallet;
        case 'totalMinted': return 1000n;
        case 'maxSupply': return 1000n;
        default: throw new Error(`Unexpected read ${method}`);
      }
    },
    metadata: async (uri, id) => {
      if (id === '2') throw new Error('Gateway unavailable');
      return { name: id === '3' ? 'DecentBusking Supporter' : 'BigNuten Supporter', properties: id === '0' ? { repo: 'https://github.com/TheJollyLaMa/BigNuten_Vanilla' } : {} };
    }
  };
  const result = await scan('8453', config, catalog, [], deps);
  assert.equal(result.status, 'partial');
  assert.equal(result.tokens.length, 3);
  const first = result.tokens.find(t => t.tokenId === '0');
  assert.equal(first.listings[0].available, '1');
  assert.equal(first.listings[0].price, '10');
  assert.equal(first.listings[0].ethPrice, '0.005');
  const fallback = result.tokens.find(t => t.tokenId === '2');
  assert.equal(fallback.metadataStatus, 'unavailable');
  assert.equal(fallback.name, 'BigNuten Supporter DNFT');
  assert.equal(fallback.listings[0].available, '0');
  assert.equal(result.tokens.find(t => t.tokenId === '3').listings.length, 0);
  assert.equal(calls.some(([method, id]) => method === 'uri' && id === '1'), false);
  const data = { version: 1, generatedAt: new Date().toISOString(), chains: { 10: { status: 'ok' }, 8453: { status: result.status } }, tokens: result.tokens, ...M.indexTokens(result.tokens) };
  assert.doesNotThrow(() => M.validateSnapshot(data));
  const old = { ...fallback, name: 'Previous BigNuten Supporter metadata', properties: { repo: 'https://github.com/TheJollyLaMa/BigNuten_Vanilla' } };
  const again = await scan('8453', config, catalog, [old], deps);
  assert.equal(again.tokens.find(t => t.tokenId === '2').metadataStatus, 'stale');
  assert.equal(again.tokens.find(t => t.tokenId === '2').name, old.name);
});
