'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Records = require('../scripts/creator-records');
const flush = () => new Promise(resolve => setImmediate(resolve));
const cid = 'bafy' + 'a'.repeat(55);
const track = (overrides = {}) => ({ nowPlaying: { playId: 'one', title: 'Community song', uploader: 'Artist',
  ipfsCid: cid, positionMs: 42000, ...overrides } });

function setup({ playError, fetchImpl = async () => ({ ok: true, json: async () => track() }) } = {}) {
  const elements = new Map(), timers = new Map(), callbacks = {}, warnings = [];
  let nextTimer = 0, fetches = 0;
  function element(id) {
    if (elements.has(id)) return elements.get(id);
    const events = {}, classes = new Set(), attributes = {};
    const el = {
      value: '0.08', textContent: '', src: '', paused: true, ended: false, duration: 300, currentTime: 0,
      classList: { toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); }, contains: name => classes.has(name) },
      setAttribute(name, value) { attributes[name] = value; },
      getAttribute: name => attributes[name],
      removeAttribute(name) { if (name === 'src') this.src = ''; delete attributes[name]; },
      addEventListener(name, fn, options) { (events[name] ||= []).push({ fn, once: options?.once }); },
      removeEventListener(name, fn) { events[name] = (events[name] || []).filter(e => e.fn !== fn); },
      fire(name) { const handlers = (events[name] || []).slice(); events[name] = handlers.filter(h => !h.once); handlers.forEach(h => h.fn()); },
      pause() { this.paused = true; }, load() {},
      async play() { if (playError) throw playError; this.paused = false; },
    };
    elements.set(id, el); return el;
  }
  vm.runInNewContext(fs.readFileSync(require.resolve('../scripts/canopy-radio.js'), 'utf8'), {
    document: { getElementById: element, addEventListener: (name, fn) => { callbacks[name] = fn; } },
    window: { addEventListener: (name, fn) => { callbacks[name] = fn; } },
    console: { warn: (...args) => warnings.push(args) }, Date, AbortController, DecentCreatorRecords: Records,
    setTimeout: (fn, delay) => { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    fetch: (...args) => { fetches++; return fetchImpl(...args); },
  });
  callbacks.DOMContentLoaded();
  return { element, timers, callbacks, warnings, fetches: () => fetches,
    tick(delay) { const item = [...timers].find(([, t]) => t.delay === delay); assert.ok(item, `Timer ${delay}`); timers.delete(item[0]); item[1].fn(); } };
}

test('radio defaults to classical at 8% volume and exposes pause, resume and volume controls', async () => {
  const h = setup(), audio = h.element('canopy-radio-audio'), button = h.element('canopy-radio-play');
  await flush();
  assert.equal(audio.src, 'https://stream.wqxr.org/wqxr-web');
  assert.equal(audio.volume, .08);
  assert.equal(audio.loop, true);
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  assert.equal(h.fetches(), 0);
  button.fire('click');
  assert.equal(audio.paused, true);
  assert.equal(button.getAttribute('aria-pressed'), 'false');
  button.fire('click'); await flush();
  assert.equal(audio.paused, false);
  h.element('canopy-radio-volume').value = '0.22';
  h.element('canopy-radio-volume').fire('input');
  assert.equal(audio.volume, .22);
  h.callbacks.pagehide();
  assert.equal(audio.paused, true);
  assert.equal(audio.src, '');
});
test('autoplay rejection is visible and does not claim radio is playing', async () => {
  const error = Object.assign(new Error('Blocked'), { name: 'NotAllowedError' });
  const h = setup({ playError: error }); await flush();
  assert.equal(h.element('canopy-radio-play').getAttribute('aria-pressed'), 'false');
  assert.match(h.element('canopy-radio-status').textContent, /autoplay blocked/);
  assert.equal(h.warnings.length, 1);
});
test('station button starts JukeLoop, seeks to live position, corrects drift and cancels polls on pause', async () => {
  const h = setup(); await flush();
  h.element('canopy-radio-station').fire('click'); await flush();
  const audio = h.element('canopy-radio-audio');
  assert.equal(audio.src, `https://gateway.pinata.cloud/ipfs/${cid}`);
  assert.equal(audio.loop, false);
  audio.fire('loadedmetadata');
  assert.ok(audio.currentTime >= 42 && audio.currentTime < 43);
  assert.match(h.element('canopy-radio-status').textContent, /Community song — Artist/);
  audio.currentTime = 1;
  h.tick(8000); await flush();
  assert.equal(audio.currentTime, 42);
  assert.equal(h.fetches(), 2);
  h.element('canopy-radio-play').fire('click');
  assert.equal(h.timers.size, 0);
  h.element('canopy-radio-station').fire('click'); await flush();
  assert.equal(audio.src, 'https://stream.wqxr.org/wqxr-web');
});
test('late JukeLoop responses cannot restart a paused radio or replace a new station', async () => {
  let resolve;
  const h = setup({ fetchImpl: () => new Promise(r => { resolve = r; }) }); await flush();
  h.element('canopy-radio-station').fire('click');
  h.element('canopy-radio-station').fire('click'); await flush();
  resolve({ ok: true, json: async () => track() }); await flush();
  assert.equal(h.element('canopy-radio-audio').src, 'https://stream.wqxr.org/wqxr-web');
  assert.equal(h.timers.size, 0);
});
test('between tracks and unpublished media pause old audio without presenting failures as success', async () => {
  for (const state of [{ nowPlaying: null }, track({ ipfsCid: null })]) {
    const h = setup({ fetchImpl: async () => ({ ok: true, json: async () => state }) }); await flush();
    h.element('canopy-radio-station').fire('click'); await flush();
    assert.equal(h.element('canopy-radio-audio').paused, true);
    assert.match(h.element('canopy-radio-status').textContent, /between tracks|not on IPFS/);
    assert.ok([...h.timers.values()].some(t => t.delay === 8000));
  }
});
test('radio fetch and media errors are explicit, retryable and cancel stale track metadata', async () => {
  const h = setup({ fetchImpl: async () => ({ ok: false, status: 503 }) }); await flush();
  h.element('canopy-radio-station').fire('click'); await flush();
  assert.match(h.element('canopy-radio-status').textContent, /unavailable · retrying/);
  assert.equal(h.warnings.length, 1);
  const media = setup(); await flush();
  media.element('canopy-radio-station').fire('click'); await flush();
  media.element('canopy-radio-play').fire('click');
  media.element('canopy-radio-audio').fire('loadedmetadata');
  assert.equal(media.element('canopy-radio-audio').currentTime, 0);
  media.element('canopy-radio-play').fire('click'); await flush();
  media.element('canopy-radio-audio').fire('error');
  assert.equal(media.element('canopy-radio-play').getAttribute('aria-pressed'), 'false');
  assert.match(media.element('canopy-radio-status').textContent, /unavailable/);
});
