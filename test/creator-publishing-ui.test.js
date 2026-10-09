'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const Records = require('../scripts/creator-records');

const wallet = '0x' + '11'.repeat(20);
const cid = 'bafy' + 'a'.repeat(55);
const source = fs.readFileSync(require.resolve('../scripts/decent-creators.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

function harness({ signatureError, postError, receipt = { status: 'published', cid }, pending = false } = {}) {
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
      querySelectorAll: () => [], replaceChildren() { this.children = []; },
      setAttribute(name, value) { this.attributes[name] = value; },
      removeAttribute(name) { delete this.attributes[name]; },
    };
    elements.set(id, el);
    return el;
  }
  const response = value => ({ ok: true, json: async () => value });
  const window = {
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
    location: { hostname: 'localhost' }, console, TextEncoder, AbortSignal, Date,
    localStorage: { getItem: () => null, setItem() {} },
    DecentLedgerProof: { CHAINS: {} }, GTPData: { load: async () => {} },
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
