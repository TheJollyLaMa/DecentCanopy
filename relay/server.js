'use strict';

/*
 * DecentCanopy reward relay. Accepts wallet-signed reward requests from the browser, checks them,
 * and forwards them to GitHub as repository_dispatch events. It holds the only GitHub token; the
 * browser never sees it. The workflow re-verifies every signature, so this relay is a gatekeeper
 * against spam rather than the source of truth.
 */

const http = require('node:http');
const { parseRewardMessage } = require('../scripts/reward-messages');
const { normalizeAirdropRequest, normalizePinnerRequest, requestIdFor } = require('../scripts/communityRewards');
const CreatorRecords = require('../scripts/creator-records');

const MAX_BODY_BYTES = 40 * 1024;
const MAX_CLOCK_SKEW_MS = 10 * 60 * 1000;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_PER_IP = 20;
const RATE_LIMIT_PER_WALLET = 6;
const STATUS_CACHE_MS = 15 * 1000;
const OWNER_CACHE_MS = 10 * 60 * 1000;

// IPFS subdomain gateways give each CID its own origin, so any pinned copy of the site can publish.
const IPFS_GATEWAY_ORIGINS = ['https://*.ipfs.inbrowser.link', 'https://*.ipfs.dweb.link', 'https://*.ipfs.w3s.link'];
const CID_LABEL = /^(baf[a-z2-7]{20,100}|k51[a-z0-9]{40,70})$/;

function originMatches(origin, allowed) {
  if (typeof origin !== 'string' || !origin) return false;
  return allowed.some(rule => {
    if (!rule.includes('*')) return rule === origin;
    const [prefix, suffix] = rule.split('*');
    if (!origin.startsWith(prefix) || !origin.endsWith(suffix)) return false;
    return CID_LABEL.test(origin.slice(prefix.length, origin.length - suffix.length));
  });
}

function createRelay({
  token,
  repository,
  allowedOrigins = [],
  verifyMessage,
  fetchImpl = fetch,
  now = () => Date.now(),
}) {
  const seenNonces = new Map();
  const hits = new Map();
  const cache = { status: null, statusAt: 0, owner: null, ownerAt: 0 };

  function github(path, options = {}) {
    return fetchImpl(`https://api.github.com${path}`, {
      ...options,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'decentcanopy-relay',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.headers || {}),
      },
    });
  }

  async function repoJson(file) {
    const response = await github(`/repos/${repository}/contents/${file}?ref=main`, { headers: { Accept: 'application/vnd.github.raw+json' } });
    if (!response.ok) throw new Error(`GitHub contents ${file} returned ${response.status}`);
    return response.json();
  }

  async function ownerWallet() {
    if (cache.owner && now() - cache.ownerAt < OWNER_CACHE_MS) return cache.owner;
    const accounts = await repoJson('contributor-accounts.json');
    const owner = (accounts.contributors || []).find(row => row.role === 'owner');
    cache.owner = owner?.walletAddress ? owner.walletAddress.toLowerCase() : null;
    cache.ownerAt = now();
    return cache.owner;
  }

  async function requestsFile() {
    if (cache.status && now() - cache.statusAt < STATUS_CACHE_MS) return cache.status;
    cache.status = await repoJson('data/community-requests.json');
    cache.statusAt = now();
    return cache.status;
  }

  function limited(key, limit) {
    const time = now();
    const recent = (hits.get(key) || []).filter(stamp => time - stamp < RATE_WINDOW_MS);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return true;
    }
    recent.push(time);
    hits.set(key, recent);
    return false;
  }

  function pruneNonces() {
    const cutoff = now() - 2 * MAX_CLOCK_SKEW_MS;
    for (const [nonce, stamp] of seenNonces) if (stamp < cutoff) seenNonces.delete(nonce);
  }

  // Returns { status, body } so it can be tested without sockets.
  async function submit(body, ip) {
    if (typeof body?.message === 'string' && body.message.startsWith('DecentCanopy creator publication v1\n')) return submitCreator(body, ip);
    if (limited(`ip:${ip}`, RATE_LIMIT_PER_IP)) return { status: 429, body: { error: 'Too many requests. Please wait a while and try again.' } };
    const { message, signature } = body || {};
    let parsed;
    try {
      parsed = parseRewardMessage(message);
    } catch (error) {
      return { status: 400, body: { error: error.message } };
    }
    if (!/^0x[a-fA-F0-9]{130}$/.test(String(signature || ''))) return { status: 400, body: { error: 'Signature is missing or malformed.' } };
    if (Math.abs(now() - Date.parse(parsed.issuedAt)) > MAX_CLOCK_SKEW_MS) {
      return { status: 400, body: { error: 'The signed request is too old or your clock is off. Please sign again.' } };
    }
    let recovered;
    try {
      recovered = String(verifyMessage(message, signature)).toLowerCase();
    } catch {
      return { status: 400, body: { error: 'The signature could not be verified.' } };
    }
    const wallet = parsed.wallet.toLowerCase();
    if (parsed.action === 'airdrop-claim') return { status: 410, body: { error: 'Artizen airdrop claims are retired. Publish a Decent Creator profile instead.' } };
    if (recovered !== wallet) return { status: 401, body: { error: 'The signature does not match the wallet in the message.' } };
    pruneNonces();
    if (seenNonces.has(parsed.nonce)) return { status: 409, body: { error: 'This signed request was already submitted.' } };
    if (limited(`wallet:${wallet}`, RATE_LIMIT_PER_WALLET)) return { status: 429, body: { error: 'Too many requests from this wallet. Please wait a while.' } };

    try {
      if (parsed.action === 'airdrop-claim') normalizeAirdropRequest(parsed.data, wallet);
      else if (parsed.action === 'pinner-request') normalizePinnerRequest(parsed.data, wallet);
      else {
        const owner = await ownerWallet();
        if (!owner || owner !== wallet) return { status: 403, body: { error: 'Only the canopy owner wallet can review requests.' } };
        if (!['approve', 'reject'].includes(parsed.data.decision) || !parsed.data.requestId) throw new Error('Review needs a requestId and an approve or reject decision.');
      }
    } catch (error) {
      return { status: 400, body: { error: error.message } };
    }

    seenNonces.set(parsed.nonce, now());
    const response = await github(`/repos/${repository}/dispatches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: parsed.action, client_payload: { message, signature } }),
    });
    if (response.status !== 204) {
      seenNonces.delete(parsed.nonce);
      return { status: 502, body: { error: `GitHub did not accept the request (${response.status}).` } };
    }
    cache.statusAt = 0;
    return { status: 202, body: { id: requestIdFor(signature), action: parsed.action } };
  }

  async function status(id) {
    if (!/^[a-f0-9]{20}$/.test(id)) return { status: 400, body: { error: 'Unknown request id.' } };
    const file = await requestsFile();
    const row = (file.requests || []).find(request => request.id === id);
    if (!row) return { status: 200, body: { id, status: 'processing' } };
    const { message, signature, reviewSignature, ...visible } = row;
    return { status: 200, body: visible };
  }

  async function submitCreator(body, ip) {
    if (limited(`ip:${ip}`, RATE_LIMIT_PER_IP)) return { status: 429, body: { error: 'Too many publications. Please wait.' } };
    let record;
    try {
      record = CreatorRecords.verify(body, verifyMessage);
      if (Math.abs(now() - Date.parse(record.updatedAt)) > MAX_CLOCK_SKEW_MS) throw new Error('Sign a fresh profile; this signature has expired.');
      const index = await repoJson('data/decent-creators.json');
      const existing = index.creators.find(row => row.record.wallet === record.wallet);
      if (CreatorRecords.assertNext(record, existing) === 'duplicate') return { status: 200, body: { id: requestIdFor(body.signature), status: 'published', cid: existing.cid } };
    } catch (error) {
      return { status: 400, body: { error: error.message } };
    }
    if (limited(`wallet:${record.wallet}`, RATE_LIMIT_PER_WALLET)) return { status: 429, body: { error: 'Too many publications from this wallet. Please wait.' } };
    const response = await github(`/repos/${repository}/dispatches`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: 'creator-publish', client_payload: { message: body.message, signature: body.signature } }),
    });
    if (response.status !== 204) return { status: 502, body: { error: `Publishing queue rejected the request (${response.status}). Keep your signed export and retry.` } };
    return { status: 202, body: { id: requestIdFor(body.signature), status: 'processing' } };
  }

  async function publicationStatus(id) {
    if (!/^[a-f0-9]{20}$/.test(id)) return { status: 400, body: { error: 'Invalid publication id.' } };
    const index = await repoJson('data/decent-creators.json');
    const receipt = (index.publications || []).find(row => row.id === id);
    return { status: 200, body: receipt || { id, status: 'processing' } };
  }

  function corsHeaders(origin) {
    if (!originMatches(origin, allowedOrigins)) return {};
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      Vary: 'Origin',
    };
  }

  async function handle(req, res) {
    const origin = req.headers.origin;
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders(origin) };
    const send = (code, body) => {
      res.writeHead(code, headers);
      res.end(body === undefined ? '' : JSON.stringify(body));
    };
    const url = new URL(req.url, 'http://relay');
    if (req.method === 'OPTIONS') return send(originMatches(origin, allowedOrigins) ? 204 : 403);
    if (req.method === 'GET' && url.pathname === '/health') return send(200, { ok: true, repository });
    if (origin && !originMatches(origin, allowedOrigins)) return send(403, { error: 'Origin not allowed.' });
    try {
      const publication = url.pathname.match(/^\/publications\/([a-f0-9]{20})$/);
      if (req.method === 'GET' && publication) {
        const result = await publicationStatus(publication[1]);
        return send(result.status, result.body);
      }
      const match = url.pathname.match(/^\/requests\/([^/]+)$/);
      if (req.method === 'GET' && match) {
        const result = await status(match[1]);
        return send(result.status, result.body);
      }
      if (req.method === 'POST' && url.pathname === '/requests') {
        if (!origin) return send(403, { error: 'Origin header required.' });
        if (!String(req.headers['content-type'] || '').startsWith('application/json')) return send(415, { error: 'Send JSON.' });
        const raw = await readBody(req);
        let body;
        try {
          body = JSON.parse(raw);
        } catch {
          return send(400, { error: 'Invalid JSON.' });
        }
        const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
        const result = await submit(body, ip);
        return send(result.status, result.body);
      }
      return send(404, { error: 'Not found.' });
    } catch (error) {
      if (!error.statusCode) console.error(error);
      return send(error.statusCode || 500, { error: error.statusCode ? error.message : 'Relay error.' });
    }
  }

  return { handle, submit, status, submitCreator, publicationStatus };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    let tooLarge = false;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 64 * MAX_BODY_BYTES) req.destroy();
      else if (size > MAX_BODY_BYTES) tooLarge = true;
      else chunks.push(chunk);
    });
    req.on('end', () => {
      if (!tooLarge) return resolve(Buffer.concat(chunks).toString('utf8'));
      const error = new Error('Request body too large.');
      error.statusCode = 413;
      reject(error);
    });
    req.on('error', reject);
  });
}

if (require.main === module) {
  const { verifyMessage } = require('ethers');
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error('GITHUB_TOKEN is required.');
    process.exit(1);
  }
  const relay = createRelay({
    token,
    repository: process.env.GITHUB_REPOSITORY || 'TheJollyLaMa/DecentCanopy',
    allowedOrigins: [
      ...String(process.env.ALLOWED_ORIGINS || 'https://thejollylama.github.io').split(',').map(origin => origin.trim()).filter(Boolean),
      ...(process.env.ALLOW_IPFS_GATEWAYS === 'false' ? [] : IPFS_GATEWAY_ORIGINS),
    ],
    verifyMessage,
  });
  const port = Number(process.env.PORT || 8787);
  http.createServer((req, res) => relay.handle(req, res)).listen(port, () => console.log(`DecentCanopy relay listening on ${port}`));
}

module.exports = { createRelay, originMatches, IPFS_GATEWAY_ORIGINS };
