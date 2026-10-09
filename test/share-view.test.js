'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Share = require('../scripts/share-view');
test('shared view roundtrips search, selection, fund, filters, toggles and world-space camera', () => {
  const state = { q: 'Akasha & community 🌲', entity: 'artizen-project:123', fund: 'artizen-fund:45',
    track: 'Projects', status: 'all', focus: true, lines: false, details: true, x: -123.25, y: 54.3, z: 2.1 };
  const url = Share.create('https://decentcanopy.eth.limo/?canopy=artizen&check=debug#old', state);
  assert.deepEqual(Share.read(url), state);
  assert.equal(new URL(url).searchParams.get('canopy'), 'artizen');
  assert.equal(new URL(url).searchParams.get('check'), null);
  assert.equal(new URL(url).hash, '');
});
test('shared links preserve Pages, path gateways, subdomain gateways and app modes', () => {
  for (const base of ['https://example.org/DecentCanopy/', 'https://gateway.test/ipfs/bafyexample/index.html',
    'https://bafyexample.ipfs.test/', 'https://decentcanopy.eth.limo/']) {
    const url = Share.create(`${base}?mode=app`, { q: 'Akasha', lines: true });
    assert.equal(new URL(url).pathname, new URL(base).pathname);
    assert.equal(new URL(url).origin, new URL(base).origin);
    assert.equal(new URL(url).searchParams.get('mode'), 'app');
  }
});
test('invalid shared input surfaces errors and normal URLs have no view to restore', () => {
  assert.equal(Share.read('https://example.org/?q=normal'), null);
  for (const query of ['view=2', 'view=1&x=NaN', 'view=1&focus=yes', 'view=1&x=0&y=0&z=99',
    'view=1&x=0&y=0&z=-1', 'view=1&x=&y=0&z=1', 'view=1&q=' + 'a'.repeat(501)]) {
    assert.throws(() => Share.read(`https://example.org/?${query}`));
  }
});
