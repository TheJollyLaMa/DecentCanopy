'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const Records = require('../scripts/creator-records');
const Images = require('../scripts/creator-images');

const wallet = '0x' + '11'.repeat(20);
const cid = 'bafy' + 'a'.repeat(55);
const source = fs.readFileSync(require.resolve('../scripts/decent-creators.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

function harness({ signatureError, postError, receipt = { status: 'published', cid }, pending = false, load = async () => {} } = {}) {
  const elements = new Map(), callbacks = {}, requests = [], timers = [];
  let snapshot, signCalls = 0;
  function element(id) {
    if (elements.has(id)) return elements.get(id);
    const listeners = {}, classes = new Set();
    const el = {
      hidden: false, disabled: false, inert: false, open: false, value: '', checked: false,
      textContent: '', dataset: {}, children: [], attributes: {},
      classList: { toggle: (name, on) => on ? classes.add(name) : classes.delete(name), contains: name => classes.has(name) },
      addEventListener: (name, fn) => { listeners[name] = fn; },
      fire(name) { const event = { preventDefault() { this.prevented = true; } }; listeners[name]?.(event); return event; },
      showModal() { this.open = true; }, close() { this.open = false; }, focus() {},
      querySelectorAll: selector => {
        if (id === 'creator-dialog' && selector === '[data-creator-profile-only]') {
          return ['creator-local-consent-label', 'creator-preview', 'creator-export', 'creator-clear'].map(element);
        }
        if (id === 'creator-local-consent-label') return [element('creator-local-consent')];
        return [];
      },
      replaceChildren() { this.children = []; },
      setAttribute(name, value) { this.attributes[name] = value; },
      removeAttribute(name) { delete this.attributes[name]; },
    };
    elements.set(id, el);
    return el;
  }
  const response = value => ({ ok: true, json: async () => value });
  const window = {
    DecentCreatorImages: Images,
    decentCanopyWallet: { address: wallet },
    addEventListener: (name, fn) => { callbacks[name] = fn; },
    ethereum: { request: async ({ method }) => {
      if (method === 'eth_accounts') return [window.decentCanopyWallet.address];
      signCalls++;
      if (signatureError) throw new Error(signatureError);
      return 'signature';
    } },
  };
  vm.runInNewContext(source, {
    window, document: { getElementById: element, addEventListener: (name, fn) => { callbacks[name] = fn; } },
    location: { hostname: 'localhost', href: 'http://localhost/index.html' }, console, TextEncoder, AbortSignal, Date, URL,
    localStorage: { getItem: () => null, setItem() {} },
    DecentLedgerProof: { CHAINS: {} }, GTPData: { load },
    ethers: { verifyMessage: () => wallet },
    DecentCreatorRecords: {
      ...Records,
      message(record) { snapshot = record; return Records.message(record); },
      verify: () => snapshot,
    },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (url.startsWith('data/')) return response({ version: 1, creators: [] });
      if (url === 'community-rewards.json') return response({ relay: { url: 'https://relay.example' } });
      if (url.endsWith('/requests')) {
        if (postError) throw new Error(postError);
        return response({ id: 1, status: 'pending' });
      }
      return response(pending ? { status: 'pending' } : receipt);
    },
  });
  callbacks.DOMContentLoaded();
  return { element, window, callbacks, requests, timers, signCalls: () => signCalls };
}

async function start(h) {
  await h.window.DecentCreators.openEditor();
  h.element('creator-name').value = 'Forest Maker';
  h.element('creator-public-consent').checked = true;
  h.element('creator-form').fire('submit');
  await flush();
}
function assertUnlocked(h, state) {
  assert.equal(h.element('creator-publishing-dialog').dataset.state, state);
  assert.equal(h.element('creator-form').inert, false);
  assert.equal(h.element('creator-form').attributes['aria-busy'], undefined);
  assert.equal(h.element('creator-publish').disabled, false);
  assert.equal(h.element('creator-close').disabled, false);
  assert.equal(h.element('creator-publishing-done').hidden, false);
  assert.equal(h.element('creator-publishing-dialog').open, true);
}

test('publishing blocks edits, duplicate submits and dismissal; pending status is beside the button and in the modal', async () => {
  const h = harness();
  await start(h);
  assert.equal(h.element('creator-publishing-dialog').open, true);
  assert.equal(h.element('creator-form').inert, true);
  assert.equal(h.element('creator-form').attributes['aria-busy'], 'true');
  assert.equal(h.element('creator-close').disabled, true);
  assert.equal(h.element('creator-publishing-done').hidden, true);
  assert.equal(h.element('creator-publishing-dialog').fire('cancel').prevented, true);
  assert.equal(h.element('creator-dialog').fire('cancel').prevented, true);
  assert.match(h.element('creator-publish-status').textContent, /Signed record sent; not yet published/);
  assert.equal(h.element('creator-publishing-message').textContent, h.element('creator-publish-status').textContent);
  assert.equal(h.element('creator-status').hidden, true);
  h.element('creator-form').fire('submit');
  await h.window.DecentCreators.openEditor();
  await flush();
  assert.equal(h.signCalls(), 1);
  assert.equal(h.requests.filter(r => r.url.endsWith('/requests')).length, 1);
  h.timers.shift().fn();
  await flush();
  assertUnlocked(h, 'success');
  assert.match(h.element('creator-publish-status').textContent, /Published at ipfs:/);
  h.element('creator-publishing-done').fire('click');
  assert.equal(h.element('creator-publishing-dialog').open, false);
});

test('wallet rejection and relay failures surface errors and unlock without claiming success', async () => {
  for (const options of [{ signatureError: 'Signature rejected' }, { postError: 'Relay unavailable' }]) {
    const h = harness(options);
    await start(h);
    assertUnlocked(h, 'error');
    assert.equal(h.element('creator-publish-status').classList.contains('is-error'), true);
    assert.match(h.element('creator-publishing-message').textContent, /Signature rejected|Relay unavailable/);
    assert.equal(h.element('creator-publishing-dialog').fire('cancel').prevented, undefined);
  }
});

test('pinning errors, invalid CIDs and pending timeouts remain explicitly unconfirmed', async () => {
  for (const options of [
    { receipt: { status: 'error', reason: 'IPFS pin failed' } },
    { receipt: { status: 'published', cid: 'invalid' } },
    { pending: true },
  ]) {
    const h = harness(options);
    await start(h);
    while (h.timers.length) { h.timers.shift().fn(); await flush(); }
    assertUnlocked(h, 'error');
    assert.match(h.element('creator-publishing-message').textContent, /IPFS pin failed|valid CID|not been confirmed/);
  }
});

test('wallet changes during publication do not refill the editor and are not reported as success', async () => {
  const h = harness();
  await start(h);
  h.window.decentCanopyWallet.address = '0x' + '22'.repeat(20);
  h.callbacks['decentcanopy:wallet-change']();
  assert.equal(h.element('creator-name').value, 'Forest Maker');
  h.timers.shift().fn();
  await flush();
  assertUnlocked(h, 'error');
  assert.match(h.element('creator-publishing-message').textContent, /Wallet changed/);
});

test('focused project editing offers only publishing and restores extra tools in the full-profile editor', () => {
  const h = harness({ load: () => new Promise(() => {}) });
  const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
  for (const id of ['creator-local-consent-label', 'creator-preview', 'creator-export']) {
    assert.match(html, new RegExp(`<[^>]*id="${id}"[^>]*data-creator-profile-only`));
  }
  h.window.DecentCreators.openEditor('forest');
  for (const id of ['creator-local-consent', 'creator-preview', 'creator-export', 'creator-clear']) {
    assert.equal(h.element(id).disabled, true);
  }
  for (const id of ['creator-local-consent-label', 'creator-preview', 'creator-export', 'creator-clear']) {
    assert.equal(h.element(id).hidden, true);
  }
  assert.equal(h.element('creator-publish').textContent, 'Sign & publish');
  assert.equal(h.element('creator-publish').disabled, false);
  assert.equal(h.element('creator-public-consent').disabled, false);
  assert.equal(h.element('creator-publish-heading').textContent, 'Publish update');
  h.window.DecentCreators.openEditor();
  for (const id of ['creator-local-consent-label', 'creator-preview', 'creator-export', 'creator-clear']) {
    assert.equal(h.element(id).hidden, false);
    assert.equal(h.element(id).disabled, false);
  }
  assert.equal(h.element('creator-local-consent').disabled, false);
  assert.equal(h.element('creator-publish').textContent, 'Sign & publish to the canopy');
  assert.equal(h.element('creator-publish-heading').textContent, 'Save, sign, or publish');
});

test('publishing canopy decoration is hidden from assistive technology and respects motion preferences', () => {
  const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
  const css = fs.readFileSync(require.resolve('../styles/creators.css'), 'utf8');
  assert.match(html, /class="creator-publishing-forest" aria-hidden="true"/);
  assert.match(html, /class="creator-publishing-orbit" aria-hidden="true"/);
  const letters = html.match(/class="creator-publishing-center">([\s\S]*?)<\/span>\s*<\/div>/)[1];
  assert.equal([...letters.matchAll(/>([A-Za-z])<\/span>/g)].map(m => m[1]).join(''), 'DecentCanopy');
  assert.match(css, /\[open\]\[data-state="working"\][\s\S]*?animation-play-state: running/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*?creator-publishing-center > span \{ animation: none; \}/);
});

test('creator project cards have collapsed artwork summaries, websites, and owner-only focused edit actions', () => {
  const h = harness();
  const record = {
    wallet, revision: 1, updatedAt: '2026-10-09T10:00:00Z', name: 'Forest Maker',
    projects: [{ key: 'forest', name: 'Forest <script>', status: 'active', description: 'A living map',
      image: 'https://forest.example/art.png', website: 'https://forest.example/', archiveId: '', wallet: '' },
    { key: 'music', name: 'Music', status: 'planning', description: '', image: '', website: '', archiveId: '', wallet: '' }],
    funds: [], funding: [], journey: [],
  };
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const creator = { creatorRecord: record };
  const html = h.window.DecentCreators.renderDetails(creator, escape);
  assert.equal((html.match(/<details class="creator-project-card">/g) || []).length, 2);
  assert.match(html, /class="creator-project-thumb" src="https:\/\/forest.example\/art.png"/);
  assert.match(html, /Forest &lt;script&gt;/);
  assert.doesNotMatch(html, /<script>|<details[^>]*\bopen\b/);
  assert.match(html, /data-creator-project-edit="forest"/);
  assert.match(html, /data-creator-view="decent-project:/);
  assert.match(html, /href="https:\/\/forest.example\/"/);
  assert.match(html, /title="Your own small, peer-to-peer video room\. Open it, then share the invite link with the people you want to chat with\." aria-label="Open my Rabbit Hole">🕳️🐇<\/a>/);
  assert.doesNotMatch(html, /<p>Your own small, peer-to-peer video room/);
  assert.match(html, /data-copy-rabbit-hole=/);
  const projectHtml = h.window.DecentCreators.renderDetails({ ...creator, creatorProjectKey: 'forest' }, escape);
  assert.match(projectHtml, /Edit this project/);
  assert.match(projectHtml, /data-creator-view="decent-creator:/);
  assert.doesNotMatch(projectHtml, /Edit my creator|creator-project-card/);
  h.window.decentCanopyWallet.address = '0x' + '22'.repeat(20);
  const visitorHtml = h.window.DecentCreators.renderDetails(creator, escape);
  assert.doesNotMatch(visitorHtml, /data-creator-project-edit|data-creator-open/);
  assert.match(visitorHtml, /Project website/);
});
