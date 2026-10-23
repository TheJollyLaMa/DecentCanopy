'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Records = require('../scripts/creator-records');
const GitHub = require('../scripts/github-repositories');
const { Wallet, verifyMessage } = require('../relay/node_modules/ethers');
const { publishCreator } = require('../scripts/publishCreator');
const { createRelay } = require('../relay/server');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const signer = new Wallet('0x' + '66'.repeat(32));
const url = 'https://github.com/thejollylama/decentbusking';
const repoId = 'github-repo:thejollylama/decentbusking';
const cid = 'bafy' + 'a'.repeat(55), nextCid = 'bafy' + 'b'.repeat(55);
const now = new Date('2026-10-20T13:00:00Z');
function record(links = [url]) {
  return Records.validate({
    format: 'decentcanopy-creator', version: 2, wallet: signer.address, consent: true,
    revision: 1, previousCid: null, updatedAt: now.toISOString(),
    name: 'Test creator', bio: '', website: '', avatar: '', location: null,
    projects: [{ key: 'music', name: 'Music', description: '', website: '', image: '', status: 'active', archiveId: '',
      ...(links === undefined ? {} : { repositories: links }) }],
    funds: [], funding: [], journey: []
  });
}
const metadata = () => ({
  private: false, visibility: 'public', full_name: 'TheJollyLaMa/DecentBusking',
  name: 'DecentBusking', owner: { login: 'TheJollyLaMa' },
  html_url: 'https://github.com/TheJollyLaMa/DecentBusking',
  description: 'not retained', token: 'not retained', private_notes: 'not retained'
});

test('public URL parser normalizes identity and rejects credentials, non-repo links, queries, and duplicates', () => {
  assert.equal(Records.repository('https://github.com/TheJollyLaMa/DecentBusking/'), url);
  assert.deepEqual(GitHub.parseInput(`\n ${url}\n`), [url]);
  assert.deepEqual(GitHub.parseInput(' \n'), []);
  for (const invalid of [
    'http://github.com/a/b', 'https://github.com.evil.test/a/b', 'https://evil.test/a/b',
    'https://github.com/a/b/issues', 'https://github.com/a', 'https://github.com/a/b?token=secret',
    'https://github.com/a/b#readme', 'https://user:password@github.com/a/b',
    'https://github.com:444/a/b', 'https://github.com/a/%62', 'https://github.com/a/..',
    'https://github.com/-a/b', 'git@github.com:a/b.git'
  ]) assert.throws(() => Records.repository(invalid), undefined, invalid);
  assert.throws(() => Records.repositories([url, url.toUpperCase()]), /duplicate/i);
  assert.equal(Records.repositories(Array.from({ length: 60 }, (_, i) => `https://github.com/example/repo${i}`)).length, 60);
  assert.throws(() => Records.repositories(Array.from({ length: 1000 }, (_, i) => `https://github.com/example/repo${i}`)), /16 KB/);
  assert.throws(() => Records.repositories([{ url, token: 'secret' }]), /text/);
});

test('optional project links preserve canonical signatures for old records and signed exports', () => {
  const index = JSON.parse(read('data/decent-creators.json'));
  for (const entry of index.creators) {
    assert.equal(Records.message(Records.verify(entry, verifyMessage)), entry.message);
  }
  const r = record([]);
  assert.equal(Object.hasOwn(r.projects[0], 'repositories'), false);
  const noLinks = structuredClone(r);
  delete noLinks.projects[0].repositories;
  assert.equal(Records.message(r), Records.message(noLinks));
  assert.deepEqual(Records.parse(Records.message(record())).projects[0].repositories, [url]);
  assert.throws(() => Records.validate({ ...record(), version: 1 }), /version 2/);
});

test('more than five repositories round-trip in a signed profile within the exact byte budget', async () => {
  const urls = Array.from({ length: 60 }, (_, i) => `https://github.com/example/repo${i}`);
  const r = record(urls), message = Records.message(r), signature = await signer.signMessage(message);
  assert.deepEqual(Records.verify({ message, signature }, verifyMessage).projects[0].repositories, urls);
  const tooMany = Array.from({ length: 425 }, (_, i) => `https://github.com/example/repo${i}`);
  assert.ok(new TextEncoder().encode(JSON.stringify(tooMany)).length < Records.MAX_BYTES);
  assert.throws(() => record(tooMany), /profile exceeds 16 KB/);
});

test('signed publication, project replacement, and unlinking preserve unrelated profile data', async () => {
  const r = record();
  r.projects.push({ ...r.projects[0], key: 'other', name: 'Other', repositories: ['https://github.com/thejollylama/decentcanopy'] });
  const envelope = async value => ({ message: Records.message(value), signature: await signer.signMessage(Records.message(value)) });
  const index = { version: 1, creators: [] };
  let pins = 0;
  const pin = async () => { pins++; return pins === 1 ? cid : nextCid; };
  await publishCreator({ envelope: await envelope(r), index, verifyMessage, pin, now });
  const signed = await envelope(r);
  assert.throws(() => Records.verify({ ...signed, message: signed.message.replace('decentbusking', 'changedrepo') }, verifyMessage), /authorize/);
  const updated = Records.replaceProject({ ...r, revision: 2, previousCid: cid }, { ...r.projects[0], repositories: [] });
  assert.deepEqual(updated.projects[1], r.projects[1]);
  assert.equal(updated.name, r.name);
  await publishCreator({ envelope: await envelope(updated), index, verifyMessage, pin, now });
  assert.equal(pins, 2);
  assert.equal(index.creators[0].record.projects[0].repositories, undefined);
  const graph = Records.apply({ projects: [], associations: [] }, index.creators);
  assert.equal(graph.projects.some(p => p.id === repoId), false);
  assert.equal(graph.projects.some(p => p.id === 'github-repo:thejollylama/decentcanopy'), true);
});

test('repository nodes deduplicate across projects and wallets without upgrading ownership trust', () => {
  const r = record();
  r.projects.push({ ...r.projects[0], key: 'second' });
  const other = { ...record(), wallet: '0x' + '22'.repeat(20) };
  const base = { projects: [{ id: 'archive', kind: 'project' }], associations: [] };
  const before = JSON.stringify({ base, r, other });
  const graph = Records.apply(base, [{ record: r }, { record: other, draft: true }]);
  assert.equal(graph.projects.filter(p => p.id === repoId).length, 1);
  assert.equal(graph.associations.filter(a => a.target === repoId).length, 3);
  graph.associations.filter(a => a.target === repoId).forEach(edge => {
    assert.equal(edge.decentClaim, 'claimed');
    assert.equal(edge.type, 'repository-link');
  });
  assert.equal(graph.projects.find(p => p.id === repoId).raised, null);
  assert.equal(JSON.stringify({ base, r, other }), before);
});

test('relay accepts canonical repo-bearing signatures and reports processing rather than premature publication', async () => {
  const calls = [], index = { version: 1, creators: [] };
  const relay = createRelay({
    token: 'test', repository: 'example/canopy', verifyMessage, now: () => now.getTime(),
    fetchImpl: async (endpoint, options) => {
      if (endpoint.endsWith('/dispatches')) {
        calls.push(JSON.parse(options.body));
        return { status: 204 };
      }
      return { ok: true, json: async () => index };
    }
  });
  const message = Records.message(record()), signature = await signer.signMessage(message);
  const response = await relay.submit({ message, signature }, 'test-repository-ip');
  assert.equal(response.status, 202);
  assert.equal(response.body.status, 'processing');
  assert.deepEqual(Records.parse(calls[0].client_payload.message).projects[0].repositories, [url]);
  assert.equal((await relay.submit({ message: message.replace('decentbusking', 'changedrepo'), signature }, 'test-repository-ip')).status, 400);
});

test('preview requests only anonymous public metadata and returns an allowlisted, dated result', async () => {
  let calls = 0;
  const result = await GitHub.preview(url, { now: () => now, fetchImpl: async (endpoint, options) => {
    calls++;
    assert.equal(endpoint, 'https://api.github.com/repos/thejollylama/decentbusking');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.deepEqual(Object.keys(options.headers), ['Accept']);
    assert.ok(options.signal);
    return { ok: true, json: async () => metadata() };
  } });
  assert.equal(calls, 1);
  assert.deepEqual(result, {
    owner: 'TheJollyLaMa', name: 'DecentBusking', url, visibility: 'public', checkedAt: now.toISOString()
  });
  assert.ok(!JSON.stringify(record()).includes('checkedAt'));
});

test('private, renamed, deleted, rate-limited, malformed and offline repositories never become successful previews', async () => {
  for (const body of [null, [], 'unexpected']) {
    await assert.rejects(GitHub.preview(url, { fetchImpl: async () => ({ ok: true, json: async () => body }) }), /malformed/);
  }
  for (const status of [404, 403, 429, 500]) {
    await assert.rejects(GitHub.preview(url, { fetchImpl: async () => ({
      ok: false, status, json() { throw new Error('Do not expose error payloads'); }
    }) }), new RegExp(`HTTP ${status}`));
  }
  for (const overrides of [
    { private: true, visibility: 'private' }, { visibility: 'internal' }, { private: undefined },
    { full_name: 'other/renamed' }, { html_url: 'https://github.com/other/renamed' },
    { name: 'changed' }, { owner: { login: 'other' } }, { owner: { login: 123 } }
  ]) {
    await assert.rejects(GitHub.preview(url, { fetchImpl: async () => ({
      ok: true, json: async () => ({ ...metadata(), ...overrides })
    }) }));
  }
  await assert.rejects(GitHub.preview(url, { fetchImpl: async () => { throw new Error('Offline'); } }), /Offline/);
  await assert.rejects(GitHub.preview(url, { fetchImpl: async () => ({ ok: true, json: async () => { throw new Error('Invalid JSON'); } }) }), /Invalid JSON/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(GitHub.preview(url, { signal: controller.signal, fetchImpl: async (_url, options) => {
    options.signal.throwIfAborted();
  } }), /abort/i);
});

test('unverified public links remain publishable when metadata is unavailable; metadata cannot enter signed records', () => {
  const r = record();
  assert.deepEqual(r.projects[0].repositories, [url]);
  r.projects[0].githubToken = 'secret';
  r.projects[0].repositoryMetadata = metadata();
  const canonical = Records.validate(r);
  assert.equal(canonical.projects[0].githubToken, undefined);
  assert.equal(canonical.projects[0].repositoryMetadata, undefined);
});

test('creator cards expose repository discovery, self-declared provenance, and project editing', () => {
  const r = record();
  const sandbox = {
    window: { decentCanopyWallet: { address: r.wallet } },
    document: { addEventListener() {} }, DecentLedgerProof: { CHAINS: {} },
    location: { href: 'https://example.org/' }, console
  };
  vm.runInNewContext(read('scripts/decent-creators.js'), sandbox);
  const escape = value => String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const html = sandbox.window.DecentCreators.renderDetails({ creatorRecord: r, creatorProjectKey: 'music' }, escape);
  assert.match(html, /GitHub repositories · self-declared/);
  assert.match(html, /data-creator-view="github-repo:thejollylama\/decentbusking"/);
  assert.match(html, /link repositories/);
  assert.match(html, /not GitHub identity or ownership verification/);
});

test('publication packages and validation include the connector without new runtime dependencies', () => {
  const files = require('../scripts/siteFiles').listSiteFiles();
  assert.ok(files.includes('scripts/github-repositories.js'));
  const page = read('index.html');
  assert.ok(page.indexOf('scripts/creator-records.js') < page.indexOf('scripts/github-repositories.js'));
  assert.ok(page.indexOf('scripts/github-repositories.js') < page.indexOf('scripts/decent-creators.js'));
});

test('GitHub controls have a distinct labelled section and a decorative logo without replacing the button name', () => {
  const source = read('scripts/decent-creators.js'), styles = read('styles/creators.css');
  assert.match(source, /<section class="creator-github-section" aria-label="GitHub repositories">/);
  assert.match(source, /<h4>Connect your code<\/h4>/);
  assert.match(source, /GitHub-Mark\.png" width="24" height="24" alt="" aria-hidden="true"/);
  assert.match(source, /<span>Sign in with GitHub \/ choose repositories<\/span>/);
  assert.match(styles, /\.creator-github-section \{[\s\S]*?gap: 16px;[\s\S]*?margin: 16px 0;/);
  assert.match(styles, /\.creator-github-section \.creator-github-connect:focus-visible/);
});

function previewHarness(preview) {
  const elements = new Map(), ready = [], events = {};
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      open: true, dataset: {}, value: '', textContent: '', disabled: false,
      addEventListener(name, callback) { if (id === 'creator-form') events[name] = callback; },
      querySelectorAll: () => [], classList: { toggle() {} }
    });
    return elements.get(id);
  };
  const input = {
    value: url, matches: selector => selector === '[data-field="repositories"]',
    closest: selector => selector === 'fieldset' ? row : null
  };
  const output = { textContent: '' }, button = { disabled: false, closest: () => row };
  const row = { dataset: {}, isConnected: true, querySelector: selector =>
    selector === '[data-field="repositories"]' ? input : selector === '[data-preview-repositories]' ? button
      : selector === '[data-repository-preview]' ? output : null };
  const click = action => events.click({
    target: { closest: selector => selector === action ? button : null }
  });
  vm.runInNewContext(read('scripts/decent-creators.js'), {
    window: { addEventListener() {}, CanopyGitHubRepositories: { parseInput: GitHub.parseInput, preview } },
    document: { getElementById: element, addEventListener: (name, callback) => { if (name === 'DOMContentLoaded') ready.push(callback); } },
    DecentLedgerProof: { CHAINS: {} }, console: { error() {} }
  });
  ready.forEach(callback => callback());
  return { input, output, button, row, element, click, change: value => {
    input.value = value;
    events.input({ target: input });
  } };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('preview UI invalidates stale responses and unlink works without publishing', async () => {
  let resolve;
  const h = previewHarness(() => new Promise(done => { resolve = done; }));
  h.click('[data-preview-repositories]');
  assert.equal(h.button.disabled, true);
  h.change('https://github.com/example/replacement');
  assert.equal(h.button.disabled, false);
  resolve({ owner: 'old', name: 'old', url, visibility: 'public', checkedAt: now.toISOString() });
  await flush();
  assert.match(h.output.textContent, /Links changed/);
  assert.doesNotMatch(h.output.textContent, /old \/ old/);
  h.click('[data-clear-repositories]');
  assert.equal(h.input.value, '');
  assert.match(h.output.textContent, /after publishing/);
});

test('closed or removed editors ignore pending previews; errors stay explicit', async () => {
  let resolve;
  const h = previewHarness(() => new Promise(done => { resolve = done; }));
  h.click('[data-preview-repositories]');
  h.element('creator-dialog').open = false;
  resolve({ owner: 'old', name: 'old', url, visibility: 'public', checkedAt: now.toISOString() });
  await flush();
  assert.doesNotMatch(h.output.textContent, /Public metadata observed only/);
  const failed = previewHarness(async () => { throw new Error('Offline'); });
  failed.click('[data-preview-repositories]');
  await flush();
  assert.match(failed.output.textContent, /Preview unavailable: Offline/);
  assert.equal(failed.button.disabled, false);
});
