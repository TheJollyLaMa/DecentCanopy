'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { WIDGET_URL, mountCanopyRadio, renderCanopyRadio } = require('../scripts/canopy-radio.js');

class Element extends EventTarget {
  constructor() {
    super(); this.children = []; this.textContent = '';
    this.attributes = {};
    this.classList = { toggle() {} };
    this.ownerDocument = { createElement: () => new Element() };
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; this.textContent = ''; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key]; }
  focus() { this.focused = true; }
}

test('Canopy pins a real full product commit and mounts one quiet, inert host widget', async () => {
  const element = new Element(), window = new EventTarget();
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
  assert.match(WIDGET_URL, /DBuskRadio@1fe9ed0c2afc61552328fdda10d0f199bc3eaee9\/widget\.js$/);
  assert.equal(mounted, 1);
  assert.equal(received.volume, 0.08);
  assert.equal(received.compact, true);
  assert.equal(received.initialStation, 'wqxr');
  assert.equal(received.render, renderCanopyRadio);
  assert.equal(received.head, head);
  assert.equal(received.stations[0].url, 'https://stream.wqxr.org/wqxr-web');
  window.dispatchEvent(new Event('pagehide'));
  radio.destroy();
  assert.equal(destroyed, 1);
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
  assert.match(css, /top: 5\.9rem/);
  assert.match(css, /top: 5\.45rem/);
  assert.doesNotMatch(css, /top: var\(--decent-head-height, 5\.\d+rem\)/);
});

test('host renderer preserves original compact controls and makes extras opt-in and keyboard accessible', () => {
  const element = new Element(), document = element.ownerDocument;
  const controls = Object.fromEntries(['play', 'volume', 'audio', 'up', 'down', 'net', 'now', 'status', 'session'].map(key => [key, new Element()]));
  controls.volume.value = '0.08';
  let selected;
  const view = renderCanopyRadio({ element, document, controls, selectStation: (...args) => { selected = args; } });
  const [row, status, details, audio] = element.children;
  assert.deepEqual(row.children, [controls.play, row.children[1], controls.volume]);
  assert.equal(audio, controls.audio);
  assert.equal(details.hidden, true);
  assert.equal(controls.volume.title, 'Radio volume: 8%');
  view.update({ station: { id: 'wqxr' }, listening: false, status: '', now: 'WQXR · live stream' });
  assert.equal(row.children[1].textContent, '🎼 WQXR');
  assert.equal(status.textContent, 'Classical · quiet');
  assert.equal(controls.play.getAttribute('aria-label'), 'Play WQXR classical radio');
  row.children[1].dispatchEvent(new Event('click'));
  assert.deepEqual(selected, ['dbusk', { play: true }]);
  view.update({ station: { id: 'dbusk' }, listening: true, status: '', now: 'A song — artist.eth' });
  assert.equal(row.children[1].textContent, '🎸 DecentBusking');
  assert.equal(status.textContent, 'A song — artist.eth');
  status.dispatchEvent(new Event('click'));
  assert.equal(details.hidden, false);
  assert.equal(status.getAttribute('aria-expanded'), 'true');
  const escape = new Event('keydown'); escape.key = 'Escape';
  element.dispatchEvent(escape);
  assert.equal(details.hidden, true);
  assert.equal(status.focused, true);
  selected = null; view.destroy();
  row.children[1].dispatchEvent(new Event('click'));
  status.dispatchEvent(new Event('click'));
  assert.equal(selected, null);
  assert.equal(details.hidden, true);
});
