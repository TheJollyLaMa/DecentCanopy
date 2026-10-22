'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Identity = require('../scripts/graph-identity');
const Layout = require('../scripts/connection-layout');
const ENS = require('../scripts/project-ens');
const Agency = require('../scripts/data-adapter/agency-adapter');
const data = () => JSON.parse(fs.readFileSync(require.resolve('../data/agency-map.json'), 'utf8'));

function resolved(node, options) {
  let finish;
  const done = new Promise(resolve => { finish = resolve; });
  const model = Identity.create({ ens: { nameFor: ENS.nameFor, artworkProfile: async () => ({}) },
    loadImage: async url => ({ src: url }), warn() {}, ...options, changed: () => finish() });
  const state = model.get(node);
  return done.then(() => ({ state, model }));
}

test('ENS-first identity belongs to exact project, with explicit GitHub owner and Discord fallback', () => {
  const node = { id: 'test', agencyDetails: { ens: 'decentagency.eth',
    discordAvatar: 'https://cdn.discordapp.com/avatars/123/abc.png' }, repoUrl: 'https://github.com/TheJollyLaMa/DecentAgency' };
  const info = Identity.identity(node, ENS);
  assert.equal(info.name, 'decentagency.eth');
  assert.match(info.fallbacks[0].url, /^https:\/\/github\.com\/TheJollyLaMa\.png/);
  assert.match(info.fallbacks[0].source, /not project-specific/);
  assert.match(info.fallbacks[1].source, /Discord/);
  assert.equal(Identity.identity({ name: 'DecentAgency' }, ENS).name, '');
  assert.deepEqual(Identity.identity({ repoUrl: 'https://github.com.evil.test/x/y',
    discordAvatar: 'javascript:alert(1)' }, ENS).fallbacks, []);
  const project = { key: 'k', ens: 'project.eth', repositories: ['https://github.com/owner/repo'] };
  assert.equal(Identity.identity({ creatorProjectKey: 'k', creatorRecord: { wallet: '0x123', projects: [project] } }, ENS).name, 'project.eth');
});

test('ENS artwork wins, banner remains separate, and shared fallback image requests deduplicate', async () => {
  const node = { id: 'p', agencyDetails: { ens: 'project.eth' }, repoUrl: 'https://github.com/owner/repo' };
  const requested = [];
  const { state } = await resolved(node, {
    ens: { artworkProfile: async name => ({ name, avatar: 'https://art.test/a.png', header: 'https://art.test/h.png' }) },
    loadImage: async url => { requested.push(url); return { src: url }; }
  });
  assert.equal(state.avatar, 'https://art.test/a.png');
  assert.equal(state.banner, 'https://art.test/h.png');
  assert.match(state.source, /ENS avatar/);
  assert.deepEqual(requested, ['https://art.test/h.png', 'https://art.test/a.png']);
  let requests = 0, completed = 0, finish;
  const done = new Promise(resolve => { finish = resolve; });
  const model = Identity.create({ ens: ENS, loadImage: async url => { requests++; return { src: url }; },
    changed: () => { if (++completed === 2) finish(); } });
  model.get({ id: 'a', repoUrl: node.repoUrl }); model.get({ id: 'b', repoUrl: node.repoUrl });
  await done;
  assert.equal(requests, 1);
});

test('ENS lookup/image failures visibly fall through GitHub then published Discord, retaining valid ENS banner', async () => {
  const node = { id: 'p', agencyDetails: { ens: 'project.eth', discordAvatar: 'https://cdn.discordapp.com/avatars/1/a.png' },
    repoUrl: 'https://github.com/owner/repo' };
  const warnings = [];
  const { state } = await resolved(node, {
    ens: { artworkProfile: async () => ({ avatar: 'https://art.test/broken', header: 'https://art.test/banner' }) },
    loadImage: async url => {
      if (url.includes('broken') || url.includes('github.com')) throw new Error('unavailable');
      return { src: url };
    }, warn: (...args) => warnings.push(args)
  });
  assert.match(state.avatar, /discordapp/);
  assert.equal(state.banner, 'https://art.test/banner');
  assert.equal(warnings.length, 2);
  assert.equal(state.notices.length, 2);
  const failed = await resolved(node, { ens: { artworkProfile: async () => { throw new Error('RPC unavailable'); } } });
  assert.match(failed.state.source, /GitHub/);
  assert.match(failed.state.notices.join(' '), /ENS artwork unavailable/);
  const empty = await resolved({ id: 'unknown' }, {});
  assert.equal(empty.state.image, null);
  assert.equal(empty.state.status, 'ready');
});

test('artwork lookup is independent of contenthash and isolates invalid banner from valid NFT avatar', async () => {
  const resolver = {
    getText: async key => key === 'avatar' ? 'eip155:1/erc721:0x123/1' : 'javascript:bad',
    getAvatar: async () => 'https://art.test/avatar.png',
    getContentHash() { throw new Error('Must not read contenthash for map artwork'); }
  };
  const art = await ENS.readArtwork('project.eth', { getResolver: async () => resolver });
  assert.equal(art.avatar, 'https://art.test/avatar.png');
  assert.equal(art.header, '');
  assert.match(art.notices[0], /ENS header unavailable/);
  await assert.rejects(ENS.readArtwork('project.eth', { getResolver: async () => null }), /no resolver/);
  const broken = await ENS.readArtwork('project.eth', { getResolver: async () => ({
    getText: async key => key === 'avatar' ? 'eip155:1/erc721:0x123/1' : '',
    getAvatar: async () => null
  }) });
  assert.equal(broken.avatar, '');
  assert.match(broken.notices[0], /could not be verified/);
});

test('identity loading bounds concurrency to four and never initiates wallet authorization', async () => {
  let active = 0, max = 0, completed = 0, finish;
  const done = new Promise(resolve => { finish = resolve; });
  const model = Identity.create({
    ens: { artworkProfile: async () => {
      active++; max = Math.max(max, active);
      await new Promise(resolve => setTimeout(resolve, 2)); active--;
      return { avatar: 'https://art.test/a.png' };
    } },
    loadImage: async url => ({ src: url }),
    changed: () => { if (++completed === 12) finish(); }
  });
  for (let i = 0; i < 12; i++) model.get({ id: String(i), agencyDetails: { ens: `p${i}.eth` } });
  await done;
  assert.equal(max, 4);
});

test('identity and image cache refresh at five minutes rather than retaining obsolete ENS art forever', async () => {
  let clock = 1000, calls = 0, images = 0, finish;
  let done = new Promise(resolve => { finish = resolve; });
  const model = Identity.create({
    ens: { artworkProfile: async () => { calls++; return { avatar: 'https://art.test/avatar' }; } },
    loadImage: async url => { images++; return { src: url }; },
    now: () => clock, changed: () => finish()
  });
  const node = { id: 'p', agencyDetails: { ens: 'project.eth' } };
  const first = model.get(node); await done;
  clock += 299999; assert.equal(model.get(node), first);
  done = new Promise(resolve => { finish = resolve; }); clock++;
  assert.notEqual(model.get(node), first); await done;
  assert.equal(calls, 2); assert.equal(images, 2);
});

test('Head covers all internal projects without inventing external adoption or overwriting existing evidence', () => {
  const d = data(), before = JSON.stringify(d), graph = Agency.transform(d);
  const source = 'agency-project:head';
  for (const project of d.projects.filter(p => p.id !== 'head' && p.kind !== 'initiative' && !p.external)) {
    assert.ok(graph.associations.some(e => e.source === source && e.target === `agency-project:${project.id}`), project.name);
  }
  const foundations = graph.associations.filter(e => e.type === 'foundational-offering');
  assert.ok(foundations.length > 20);
  assert.ok(foundations.every(e => e.relationshipState === 'reported' && /not evidence of adoption/.test(e.note)));
  assert.ok(!foundations.some(e => /:cadcad$|:head$|:decent-agency$/.test(e.target)));
  for (const edge of d.relationships.filter(e => e.source === 'head')) {
    assert.ok(graph.associations.some(e => e.source === source && e.target === `agency-project:${edge.target}` &&
      e.relationshipState === edge.state && e.type === edge.type));
  }
  assert.equal(JSON.stringify(d), before);
  assert.equal(d.projects.find(p => p.id === 'decent-agency').ens, 'decentagency.eth');
  assert.equal(d.projects.find(p => p.id === 'decent-busking').ens, 'decentbusking.decentagency.eth');
  assert.equal(d.projects.find(p => p.id === 'big-nuten').ens, 'bignuten.thejollylama.eth');
  for (const mutate of [
    d => { d.projects[0].ens = 'not a name'; },
    d => { d.projects[0].discordAvatar = 'https://evil.test/avatar.png'; },
    d => { d.foundationalProvider = 'cadcad'; },
    d => { d.foundationalProvider = 'unknown'; }
  ]) { const bad = data(); mutate(bad); assert.throws(() => Agency.transform(bad)); }
});

test('layout is deterministic, input-preserving, deduplicates repeated claims, and separates connected communities', () => {
  const nodes = Array.from({ length: 12 }, (_, i) => ({ id: String(i), kind: 'project' }));
  const edges = [];
  for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) {
    if (Math.floor(i / 4) === Math.floor(j / 4)) edges.push({ source: String(i), target: String(j) });
  }
  const original = JSON.stringify([nodes, edges]), positions = Layout.solve(nodes, edges);
  assert.deepEqual(Layout.solve([...nodes].reverse(), [...edges].reverse()), positions);
  assert.deepEqual(Layout.solve(nodes, [...edges, ...edges, { source: 'missing', target: '0' }]), positions);
  const distance = (a, b) => Math.hypot(positions.get(a).x - positions.get(b).x, positions.get(a).y - positions.get(b).y);
  const linked = edges.reduce((n, e) => n + distance(e.source, e.target), 0) / edges.length;
  const other = [];
  nodes.forEach((a, i) => nodes.slice(i + 1).forEach(b => { if (Math.floor(+a.id / 4) !== Math.floor(+b.id / 4)) other.push(distance(a.id, b.id)); }));
  assert.ok(linked < other.reduce((a, b) => a + b) / other.length * 0.8);
  assert.equal(JSON.stringify([nodes, edges]), original);
  assert.equal(Layout.solve([], []).size, 0);
});

test('real map has finite distinct coordinates and avatar clearance; interpolation honors reduced motion', () => {
  const graph = Agency.transform(data()), positions = Layout.solve(graph.projects, graph.associations);
  assert.equal(positions.size, graph.projects.length);
  for (const [id, p] of positions) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
    for (const [other, q] of positions) if (id !== other) assert.ok(Math.hypot(p.x - q.x, p.y - q.y) > 45);
  }
  const updated = Layout.solve(graph.projects, [...graph.associations,
    { source: 'agency-project:bean', target: 'agency-project:big-nuten', type: 'could-reuse' }], positions);
  const movements = [...positions].map(([id, point]) => Math.hypot(point.x - updated.get(id).x, point.y - updated.get(id).y));
  assert.ok(Math.max(...movements) < 60, 'one new link should gently rearrange existing nodes');
  assert.ok(movements.reduce((a, b) => a + b) / movements.length < 20);
  const from = { x: 0, y: 20 }, to = { x: 200, y: 100 };
  assert.deepEqual(Layout.interpolate(from, to, 0), from);
  assert.deepEqual(Layout.interpolate(from, to, 0.5), { x: 100, y: 60 });
  assert.deepEqual(Layout.interpolate(from, to, 1), to);
  assert.deepEqual(Layout.interpolate(from, to, 0, true), to);
});

test('validated Agency refresh updates shared selectors atomically, retains prior graph on failure, and detects unchanged snapshots', async () => {
  let current = data(), fail = false;
  const sandbox = {
    window: { location: { search: '?canopy=agency' }, GTPAgencyDataAdapter: Agency },
    URL, URLSearchParams, AbortSignal, console,
    GTPModeRouter: { getModeInfo: () => ({ mode: 'prototype' }) },
    fetch: async () => ({ ok: !fail, status: fail ? 503 : 200, json: async () => current })
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../scripts/data-adapter/agency-adapter.js'), 'utf8'), sandbox);
  sandbox.window.GTPAgencyDataAdapter = sandbox.GTPAgencyDataAdapter;
  for (const file of ['data-adapter/interface.js', 'data-layer.js']) {
    vm.runInNewContext(fs.readFileSync(require.resolve(`../scripts/${file}`), 'utf8'), sandbox);
  }
  await sandbox.GTPData.load();
  assert.equal(await sandbox.GTPData.refreshAgency(), false);
  current.projects.push({ id: 'new-project', name: 'New project' });
  assert.equal(await sandbox.GTPData.refreshAgency(), true);
  assert.ok(sandbox.GTPData.getProjectById('agency-project:new-project'));
  assert.ok(sandbox.GTPData.getAssociations().some(e => e.source === 'agency-project:head' && e.target === 'agency-project:new-project'));
  const old = JSON.stringify(sandbox.GTPData.getProjects());
  current.projects[0].ens = 'invalid';
  await assert.rejects(sandbox.GTPData.refreshAgency(), /ENS/);
  assert.equal(JSON.stringify(sandbox.GTPData.getProjects()), old);
  fail = true;
  await assert.rejects(sandbox.GTPData.refreshAgency(), /503/);
  assert.equal(JSON.stringify(sandbox.GTPData.getProjects()), old);
});
