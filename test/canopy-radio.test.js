'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { WIDGET_URL, mountCanopyRadio } = require('../scripts/canopy-radio.js');

class Element extends EventTarget {
  constructor() {
    super(); this.children = []; this.textContent = '';
    this.ownerDocument = { createElement: () => new Element() };
  }
  append(node) { this.children.push(node); }
  replaceChildren() { this.children = []; this.textContent = ''; }
}

test('Canopy pins a real full product commit and mounts one quiet, inert host widget', async () => {
  const element = new Element(), window = new EventTarget();
  let headerHeight = 190, published, observed = 0, disconnected = 0;
  window.ResizeObserver = class {
    observe() { observed++; }
    disconnect() { disconnected++; }
  };
  element.closest = () => ({ getBoundingClientRect: () => ({ height: headerHeight }) });
  element.ownerDocument.documentElement = { style: { setProperty: (key, value) => {
    assert.equal(key, '--decent-head-height'); published = value;
  } } };
  const head = { getWallet() { throw new Error('Host must not request accounts'); } };
  let mounted = 0, destroyed = 0, received;
  const radio = mountCanopyRadio(element, { window, head, loadWidget: async url => {
    assert.equal(url, WIDGET_URL);
    return { mount: (target, options) => {
      assert.equal(target, element); mounted++; received = options;
      return { destroy() { destroyed++; } };
    } };
  } });
  await radio.ready;
  assert.match(WIDGET_URL, /DBuskRadio@269cbe22ae682c226206a0de89375dad7f9a6f6f\/widget\.js$/);
  assert.equal(mounted, 1);
  assert.equal(received.volume, 0.08);
  assert.equal(received.compact, true);
  assert.equal(received.initialStation, 'wqxr');
  assert.equal(received.head, head);
  assert.equal(received.stations[0].url, 'https://stream.wqxr.org/wqxr-web');
  assert.equal(published, '190px');
  assert.equal(observed, 1);
  headerHeight = 229;
  window.dispatchEvent(new Event('resize'));
  assert.equal(published, '229px');
  window.dispatchEvent(new Event('pagehide'));
  radio.destroy();
  assert.equal(destroyed, 1);
  assert.equal(disconnected, 1);
  headerHeight = 300;
  window.dispatchEvent(new Event('resize'));
  assert.equal(published, '229px');
});

test('late imports cannot mount after host destroy', async () => {
  const element = new Element(), window = new EventTarget();
  let resolve, mounts = 0;
  const radio = mountCanopyRadio(element, { window,
    loadWidget: () => new Promise(done => { resolve = done; }) });
  radio.destroy(); radio.destroy();
  resolve({ mount() { mounts++; } });
  await radio.ready;
  assert.equal(mounts, 0);
  assert.equal(element.children.length, 0);
});

test('failed widget imports expose retry instead of a duplicate local radio client', async () => {
  const element = new Element(), window = new EventTarget();
  let attempts = 0, mounts = 0;
  const warn = console.warn;
  console.warn = () => {};
  try {
    const radio = mountCanopyRadio(element, { window, loadWidget: async () => {
      if (++attempts === 1) throw new Error('CDN unavailable');
      return { mount() { mounts++; return { destroy() {} }; } };
    } });
    await radio.ready;
    assert.match(element.textContent, /unavailable/);
    element.children[0].dispatchEvent(new Event('click'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(attempts, 2); assert.equal(mounts, 1);
    radio.destroy();
  } finally { console.warn = warn; }
});

test('Canopy markup retains header placement without its old parallel audio/streamer', () => {
  const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
  const adapter = fs.readFileSync(require.resolve('../scripts/canopy-radio.js'), 'utf8');
  assert.match(html, /id="canopy-radio-widget" class="canopy-radio"/);
  assert.doesNotMatch(html, /id="canopy-radio-(audio|play|station|volume)"/);
  assert.doesNotMatch(adapter, /pinata\.cloud|\/api\/radio\/vote|setInterval|new Audio/);
  const css = fs.readFileSync(require.resolve('../styles/spiral.css'), 'utf8');
  assert.equal((css.match(/top: var\(--decent-head-height, 5\.\d+rem\)/g) || []).length, 2);
});
