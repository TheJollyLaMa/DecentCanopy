'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseList, mergePins, requestPin, waitPinned, CID_V1, MULTIADDR } = require('../scripts/pinAgencyCids');

const CID = 'bafybeieu4ypnyluhjokrpjyjcr6rcguwokvawsgrq7qqcaa264vc2qqt34';
const HOST = '/ip4/74.65.39.96/tcp/4001/p2p/12D3KooWJ2CDmExE9jkZShs5ZpjpZzSjEKAfRNdUE57qRkvT8GMc';

test('CID and host lists are de-duplicated and rejected when malformed', () => {
  assert.deepEqual(parseList(`${CID}, ${CID}\n`, CID_V1, 'CIDv1'), [CID]);
  assert.throws(() => parseList('QmLegacyV0Hash', CID_V1, 'CIDv1'), /Invalid CIDv1: QmLegacyV0Hash/);
  assert.deepEqual(parseList(HOST, MULTIADDR, 'host'), [HOST]);
  assert.throws(() => parseList('/ip4/1.2.3.4/tcp/4001', MULTIADDR, 'host'), /Invalid host/);
  assert.deepEqual(parseList('', MULTIADDR, 'host'), []);
});

test('pin requests send the exact CID, label and host hints with the bearer token', async () => {
  let seen;
  await requestPin(CID, 'DecentMarket site', [HOST], 'jwt', async (url, init) => {
    seen = { url, init };
    return { ok: true, text: async () => '{}' };
  });
  assert.equal(seen.url, 'https://api.pinata.cloud/pinning/pinByHash');
  assert.equal(seen.init.headers.Authorization, 'Bearer jwt');
  assert.deepEqual(JSON.parse(seen.init.body), { hashToPin: CID, pinataMetadata: { name: 'DecentMarket site' }, pinataOptions: { hostNodes: [HOST] } });
  await assert.rejects(requestPin(CID, 'x', [], 'jwt', async () => ({ ok: false, status: 403, text: async () => 'nope' })), /pinByHash/);
});

test('pins are only confirmed when Pinata lists the exact CID as pinned', async () => {
  let calls = 0;
  const fetchImpl = async () => ({ ok: true, json: async () => ({ rows: ++calls < 3 ? [] : [{ ipfs_pin_hash: CID }] }) });
  assert.equal(await waitPinned(CID, 'jwt', { fetchImpl, intervalMs: 0, sleep: async () => {} }), true);
  assert.equal(calls, 3);
  const never = async () => ({ ok: true, json: async () => ({ rows: [{ ipfs_pin_hash: `${CID}x` }] }) });
  assert.equal(await waitPinned(CID, 'jwt', { fetchImpl: never, timeoutMs: 0, sleep: async () => {} }), false);
});

test('manifest keeps earlier pins and updates repeated CIDs in place', () => {
  const first = mergePins({ pins: [] }, [{ cid: CID, label: 'DecentMarket site', status: 'requested' }]);
  const second = mergePins(first, [{ cid: CID, label: 'DecentMarket site', status: 'pinned' }, { cid: 'bafyother000000000000000000', label: 'DecentHead site', status: 'pinned' }]);
  assert.equal(second.pins.length, 2);
  assert.equal(second.pins.find(p => p.cid === CID).status, 'pinned');
  assert.deepEqual(second.pins.map(p => p.label), ['DecentHead site', 'DecentMarket site']);
});
