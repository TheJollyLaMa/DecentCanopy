'use strict';

const crypto = require('node:crypto');

const DAY_MS = 86400000;

// Newest first: the current backup plus recent ones still inside the grace window.
function acceptedCids(manifest, { now = new Date(), maxAgeDays = 8 } = {}) {
  if (!manifest?.cid) return [];
  const rows = [
    { cid: manifest.cid, pinnedAt: manifest.pinnedAt, payloadSha256: manifest.payloadSha256 || null },
    ...(Array.isArray(manifest.recentCids) ? manifest.recentCids : []),
  ];
  const seen = new Set();
  return rows.filter((row, index) => {
    if (!row?.cid || seen.has(row.cid)) return false;
    seen.add(row.cid);
    if (index === 0) return true;
    const age = now - new Date(row.pinnedAt);
    return Number.isFinite(age) && age <= maxAgeDays * DAY_MS;
  });
}

async function readCapped(response, maxBytes) {
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error(`payload is larger than ${maxBytes} bytes`);
  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw new Error(`payload is larger than ${maxBytes} bytes`);
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`payload is larger than ${maxBytes} bytes`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/*
 * A pinner passes when their own gateway serves bytes for an accepted CID that hash to the
 * payload recorded in the backup manifest. This proves availability through that gateway, not
 * exclusive storage; operators are asked to disable gateway fetching from the wider network.
 */
async function checkGateway(gateway, row, { fetchImpl = fetch, maxBytes = 20000000, timeoutMs = 30000 } = {}) {
  const started = Date.now();
  const url = `${String(gateway).replace(/\/+$/, '')}/ipfs/${row.cid}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, redirect: 'follow' });
    if (!response.ok) return { ok: false, cid: row.cid, reason: `HTTP ${response.status}`, ms: Date.now() - started };
    const bytes = await readCapped(response, maxBytes);
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    if (row.payloadSha256 && sha256 !== row.payloadSha256) {
      return { ok: false, cid: row.cid, reason: 'content hash mismatch', ms: Date.now() - started };
    }
    if (!row.payloadSha256) {
      const parsed = JSON.parse(bytes.toString('utf8'));
      if (parsed?.format !== 'decentcanopy-data-backup') return { ok: false, cid: row.cid, reason: 'not a DecentCanopy backup', ms: Date.now() - started };
    }
    return { ok: true, cid: row.cid, sha256, ms: Date.now() - started };
  } catch (error) {
    return { ok: false, cid: row.cid, reason: error.name === 'AbortError' ? 'timed out' : error.message, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

async function checkPinner(pinner, accepted, options) {
  let last = { ok: false, cid: accepted[0]?.cid || null, reason: 'no accepted CID' };
  for (const row of accepted) {
    last = await checkGateway(pinner.gateway, row, options);
    if (last.ok) return last;
  }
  return last;
}

function rewardablePinners(pinners, results, max) {
  return pinners
    .filter(pinner => pinner.status === 'approved' && results.get(pinner.github)?.ok)
    .sort((a, b) => String(a.approvedAt).localeCompare(String(b.approvedAt)))
    .slice(0, max);
}

function activeCommunityPinners(pinners, { now = new Date(), maxAgeDays = 8 } = {}) {
  return (pinners?.pinners || []).filter(pinner => pinner.status === 'approved' && pinner.lastCheck?.ok
    && now - new Date(pinner.lastCheck.checkedAt) <= maxAgeDays * DAY_MS);
}

module.exports = { acceptedCids, activeCommunityPinners, checkGateway, checkPinner, rewardablePinners };
