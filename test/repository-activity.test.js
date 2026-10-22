'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Model = require('../scripts/repository-activity');
const Supporters = require('../scripts/supporter-dnft-model');
const now = new Date('2026-10-22T12:00:00.000Z');
const repo = 'maker/forest';
const node = { repoUrl: `https://github.com/${repo}` };
const row = (count = 5) => ({ repo, status: 'ok', attemptedAt: now.toISOString(), checkedAt: now.toISOString(),
  windowStart: new Date(now.getTime() - Model.WINDOW_MS).toISOString(), defaultBranch: 'main', archived: false,
  openIssuesAndPRs: 3, commits7d: count, capped: false, latestCommit: null, release: null, error: '' });
const snapshot = repositories => ({ version: 1, generatedAt: now.toISOString(), repositories });
const response = (value, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => value });
const info = { private: false, visibility: 'public', full_name: repo, html_url: node.repoUrl,
  default_branch: 'main', archived: false, open_issues_count: 3, size: 1 };
const commit = (date = now.toISOString()) => ({ sha: 'a'.repeat(40), html_url: `${node.repoUrl}/commit/${'a'.repeat(40)}`, commit: { committer: { date } } });

test('activity snapshot rejects invalid identities, metrics, duplicate rows, unsafe evidence and invalid release mirrors', () => {
  assert.equal(Model.validate(snapshot([row()])).repositories.length, 1);
  assert.doesNotThrow(() => Model.validate(snapshot([{ repo, status: 'unavailable', attemptedAt: now.toISOString(), error: 'HTTP 404' }])));
  for (const mutate of [
    d => { d.version = 2; }, d => { d.repositories.push(row()); },
    d => { d.repositories[0].repo = 'https://github.com/maker/forest'; },
    d => { d.repositories[0].commits7d = -1; }, d => { d.repositories[0].commits7d = 101; },
    d => { d.repositories[0].checkedAt = 'invalid'; }, d => { d.repositories[0].status = 'live'; },
    d => { d.repositories[0].latestCommit = { sha: 'a'.repeat(40), date: now.toISOString(), url: 'javascript:alert(1)' }; },
    d => { d.repositories[0].release = { tag: 'v1', publishedAt: now.toISOString(), url: 'https://github.com/other/repo/releases/tag/v1' }; }
  ]) {
    const data = snapshot([row()]); mutate(data); assert.throws(() => Model.validate(data));
  }
});

test('heat thresholds and stale/partial/unavailable states distinguish unknown from zero', () => {
  for (const [count, expected] of [[0, 'quiet'], [1, 'low'], [4, 'low'], [5, 'medium'], [19, 'medium'], [20, 'high'], [100, 'high']]) {
    assert.equal(Model.heat(row(count), now.getTime()), expected);
  }
  assert.equal(Model.heat(row(), now.getTime() + Model.STALE_MS), 'medium');
  assert.equal(Model.heat(row(), now.getTime() + Model.STALE_MS + 1), 'unknown');
  for (const status of ['partial', 'unavailable']) assert.equal(Model.heat({ ...row(), status }, now.getTime()), 'unknown');
  assert.equal(Model.heat(undefined, now.getTime()), 'unknown');
  assert.equal(Model.heat({ ...row(), checkedAt: new Date(now.getTime() + 120000).toISOString() }, now.getTime()), 'unknown');
});

test('project aggregation deduplicates public repos and requires all linked repositories; endpoint heat never upgrades claims', () => {
  const project = { creatorProjectKey: 'p', creatorRecord: { projects: [{ key: 'p', repositories: [node.repoUrl, 'https://github.com/other/project'] }] }, repoUrl: node.repoUrl };
  assert.equal(Model.repositoriesForNode(project).length, 2);
  assert.equal(Model.nodeHeat(snapshot([row(2)]), project, now.getTime()), 'unknown');
  const other = { ...row(4), repo: 'other/project' };
  assert.equal(Model.nodeHeat(snapshot([row(2), other]), project, now.getTime()), 'medium');
  const edge = { relationshipState: 'proposed', type: 'could-reuse' };
  assert.equal(Model.edgeHeat(snapshot([row()]), node, node, now.getTime()).activeTogether, true);
  assert.equal(Model.edgeHeat(snapshot([row(0)]), node, node, now.getTime()).activeTogether, false);
  assert.equal(edge.relationshipState, 'proposed');
});

test('collector uses only public read APIs, preserves no token, handles releases, counts bounded seven-day commits', async () => {
  const { collect } = await import('../scripts/build-repository-activity.mjs');
  const calls = [];
  const result = await collect(repo, { now: () => now, token: 'fixture-not-a-secret', fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith(`/repos/${repo}`)) return response(info);
    if (url.includes('/commits?')) return response([commit(), commit('2026-10-01T00:00:00Z'), commit('2026-10-23T00:00:00Z')]);
    return response({ tag_name: 'v1.0.0', published_at: now.toISOString(), html_url: `${node.repoUrl}/releases/tag/v1.0.0`, assets: [] });
  } });
  assert.equal(result.status, 'ok');
  assert.equal(result.commits7d, 1);
  assert.equal(result.latestCommit.sha, 'a'.repeat(40));
  assert.equal(result.release.tag, 'v1.0.0');
  assert.doesNotMatch(JSON.stringify(result), /fixture-not-a-secret/);
  assert.ok(calls.every(call => call.url.startsWith(`https://api.github.com/repos/${repo}`) && !call.options.method));
  assert.ok(calls.every(call => call.options.redirect === 'error'));
});

test('private/renamed/not-found/rate-limited repositories never publish fetched private metadata', async () => {
  const { collect } = await import('../scripts/build-repository-activity.mjs');
  for (const value of [{ ...info, private: true, name: 'private-name' }, { ...info, full_name: 'other/renamed' }, 404, 403, 429]) {
    let calls = 0;
    const result = await collect(repo, { now: () => now, fetchImpl: async () => {
      calls++;
      return typeof value === 'number' ? response(null, value) : response(value);
    } });
    assert.equal(result.status, 'unavailable');
    assert.equal(result.commits7d, undefined);
    assert.doesNotMatch(JSON.stringify(result), /private-name/);
    assert.equal(calls, 1);
  }
});

test('capped samples, empty repos, failed commits and unavailable releases remain explicit', async () => {
  const { collect } = await import('../scripts/build-repository-activity.mjs');
  const run = (commits, releaseStatus = 404, repository = info) => collect(repo, { now: () => now, fetchImpl: async url => {
    if (url.endsWith(`/repos/${repo}`)) return response(repository);
    if (url.includes('/commits?')) return typeof commits === 'number' ? response(null, commits) : response(commits);
    return response(null, releaseStatus);
  } });
  const capped = await run(Array.from({ length: 100 }, () => commit()));
  assert.equal(capped.commits7d, 100); assert.equal(capped.capped, true);
  assert.equal((await run([], 404, { ...info, size: 0 })).commits7d, 0);
  const broken = await run(503);
  assert.equal(broken.status, 'partial');
  assert.equal(broken.commits7d, null);
  assert.match(broken.error, /Commit sample unavailable/);
  assert.equal(Model.heat(broken, now.getTime()), 'unknown');
  const noRelease = await run([commit()], 503);
  assert.equal(noRelease.status, 'partial');
  assert.match(noRelease.error, /Release check unavailable/);
});

test('official release artwork requires consistent manifest, metadata and mint evidence; credentials never go to assets', async () => {
  const { collect } = await import('../scripts/build-repository-activity.mjs');
  const prefix = `${node.repoUrl}/releases/download/v1/`;
  const names = ['supporter-release.json', 'supporter-metadata.json', 'supporter-evidence.json', 'supporter-front.png', 'supporter-back.png'];
  const release = { tag_name: 'v1', published_at: now.toISOString(), html_url: `${node.repoUrl}/releases/tag/v1`,
    assets: names.map(name => ({ name, browser_download_url: prefix + name })) };
  const manifest = { repo, version: 'v1', metadataURI: 'ipfs://Qmfixture', front: 'ipfs://front', back: 'ipfs://back' };
  const metadata = { image: manifest.front, properties: { repo, version: 'v1', back_image: manifest.back } };
  const mint = { chainId: 8453, nftContract: Supporters.CHAINS[8453].nft, tokenId: '70' };
  const fetchImpl = async (url, options) => {
    if (url.startsWith(prefix)) {
      assert.equal(options.headers.Authorization, undefined);
      return response(url.endsWith('supporter-release.json') ? manifest : url.endsWith('supporter-metadata.json') ? metadata : mint);
    }
    return response(url.endsWith(`/repos/${repo}`) ? info : url.includes('/commits?') ? [commit()] : release);
  };
  const result = await collect(repo, { now: () => now, token: 'fixture', fetchImpl });
  assert.ok(result.release.supporter);
  const token = { chainId: 8453, contract: mint.nftContract, tokenId: '70', metadataUri: 'https://ipfs.io/ipfs/Qmfixture' };
  assert.ok(Model.releaseMirror(snapshot([result]), token));
  assert.equal(Model.releaseMirror(snapshot([result]), { ...token, tokenId: '71' }), null);
  assert.equal(Model.releaseMirror(snapshot([result]), { ...token, metadataUri: 'ipfs://different' }), null);
  metadata.properties.version = 'wrong';
  const bad = await collect(repo, { now: () => now, fetchImpl });
  assert.equal(bad.release.supporter, undefined);
  assert.match(bad.error, /disagree/);
});

test('checked-in snapshot and workflow wiring cover the public catalog without claiming private visibility', async () => {
  const { buildCatalog } = await import('../scripts/build-supporter-dnfts.mjs');
  const read = file => fs.readFileSync(require.resolve(`../${file}`), 'utf8');
  const data = Model.validate(JSON.parse(read('data/repository-activity.json')));
  const catalog = buildCatalog(...['data/agency-map.json', 'data/decent-creators.json', 'data/project-details.json'].map(file => JSON.parse(read(file))));
  // A freshly published creator can precede the next collector run.
  assert.ok(data.repositories.length > 0);
  assert.ok(data.repositories.every(r => catalog.some(c => c.repo === r.repo)));
  assert.match(read('.github/workflows/publish-site.yml'), /Refresh Public Repository Activity/);
  assert.match(read('.github/workflows/repository-activity.yml'), /7,22,37,52/);
  for (const name of ['decenthead', 'decentmarket']) {
    const r = data.repositories.find(item => item.repo === `thejollylama/${name}`);
    assert.ok(r);
  }
});

test('browser failures are surfaced, snapshot fetches omit credentials and rendering uses text nodes', async () => {
  class Element {
    constructor() { this.children = []; }
    append(...children) { this.children.push(...children); }
    setAttribute() {}
    querySelector() { return null; }
    set innerHTML(_) { throw new Error('Untrusted GitHub strings must use text nodes'); }
  }
  const window = { CanopyRepositoryActivity: Model };
  const document = { createElement: () => new Element() };
  let fail = false;
  const unsafe = row(); unsafe.defaultBranch = '<img src=x onerror=alert(1)>';
  vm.runInNewContext(fs.readFileSync(require.resolve('../scripts/repository-activity-ui'), 'utf8'), {
    window, document, console: { warn() {} }, fetch: async (_, options) => {
      assert.equal(options.credentials, 'omit'); assert.equal(options.cache, 'no-store');
      return fail ? response(null, 503) : response(snapshot([unsafe]));
    }
  });
  const api = window.CanopyRepositoryActivityUI;
  await api.load();
  const container = new Element();
  api.mount(container, node);
  const flatten = el => [el, ...el.children.flatMap(flatten)];
  assert.ok(flatten(container).some(el => el.textContent?.includes('<img')));
  fail = true;
  await assert.rejects(api.load(), /HTTP 503/);
  const failed = new Element(); api.mount(failed, node);
  assert.ok(flatten(failed).some(el => el.textContent?.includes('not live')));
  assert.equal(api.nodeHeat(node), 'unknown');
});

test('new public-data backups include activity while previous public backups remain recoverable', () => {
  const Backup = require('../scripts/public-backup');
  const payload = { format: 'decentcanopy-data-backup', version: 1, createdAt: now.toISOString(),
    files: Object.fromEntries(Backup.DATA_FILES.map(file => [file, {}])) };
  assert.doesNotThrow(() => Backup.validatePayload(payload));
  delete payload.files['data/repository-activity.json'];
  assert.doesNotThrow(() => Backup.validatePayload(payload));
  delete payload.files['data/decent-creators.json'];
  assert.throws(() => Backup.validatePayload(payload), /complete published/);
});

test('artwork caching is bounded and validates PNG dimensions, with explicit failure and no partial preview claims', async () => {
  const { cacheArtwork } = await import('../scripts/build-repository-activity.mjs');
  const png = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(png);
  png.write('IHDR', 12); png.writeUInt32BE(1200, 16); png.writeUInt32BE(1200, 20);
  const makeRow = () => ({ ...row(), release: { tag: 'v1', supporter: { front: 'https://github.com/maker/forest/releases/download/v1/front.png', back: 'https://github.com/maker/forest/releases/download/v1/back.png' } } });
  const writes = [];
  const good = makeRow();
  await cacheArtwork(good, { fetchImpl: async () => new Response(png), mkdir: async () => {}, write: async (url, bytes) => writes.push({ url, bytes }) });
  assert.equal(writes.length, 2);
  assert.match(good.release.supporter.frontPreview, /^assets\/supporter-releases\/[a-f0-9]{24}\/front.png$/);
  for (const value of [Buffer.from('<svg>not PNG</svg>'), Buffer.alloc(5 * 1024 * 1024 + 1)]) {
    const bad = makeRow();
    await cacheArtwork(bad, { fetchImpl: async () => new Response(value), mkdir: async () => {}, write: async () => assert.fail('Invalid artwork must not be written') });
    assert.equal(bad.release.supporter.frontPreview, undefined);
    assert.match(bad.error, /preview unavailable/);
  }
});
