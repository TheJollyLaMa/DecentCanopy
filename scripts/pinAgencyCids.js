'use strict';
// Keeps Agency project content (release sites, ENS artwork) pinned with the community Pinata account,
// and records exactly which CIDs Canopy is holding so ENS contenthash records can be checked against it.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pinFolder } = require('./pinSite');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'data', 'agency-pins.json');
const PIN_URL = 'https://api.pinata.cloud/pinning/pinByHash';
const LIST_URL = 'https://api.pinata.cloud/data/pinList';
const CID_V1 = /^baf[a-z2-7]{20,100}$/;
const MULTIADDR = /^\/(ip4|ip6|dns4|dns6|dnsaddr)\/[^\s]+\/p2p\/12D3Koo[1-9A-HJ-NP-Za-km-z]{40,60}$/;
const REPO = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

function parseList(value, pattern, kind) {
  const items = [...new Set(String(value || '').split(/[\s,]+/).filter(Boolean))];
  const bad = items.filter(item => !pattern.test(item));
  if (bad.length) throw new Error(`Invalid ${kind}: ${bad.join(', ')}`);
  return items;
}

function readManifest() {
  try { return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')); } catch { return { format: 'decentcanopy-agency-pins', version: 1, pins: [] }; }
}

function mergePins(manifest, rows) {
  const byCid = new Map((manifest.pins || []).map(row => [row.cid, row]));
  rows.forEach(row => byCid.set(row.cid, { ...byCid.get(row.cid), ...row }));
  return { format: 'decentcanopy-agency-pins', version: 1, provider: 'Pinata', pins: [...byCid.values()].sort((a, b) => a.label.localeCompare(b.label) || a.cid.localeCompare(b.cid)) };
}

async function requestPin(cid, label, hosts, token, fetchImpl = fetch) {
  const body = { hashToPin: cid, pinataMetadata: { name: label } };
  if (hosts.length) body.pinataOptions = { hostNodes: hosts };
  const response = await fetchImpl(PIN_URL, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    const hint = response.status === 401 || response.status === 403 ? ' PINATA_JWT needs the legacy "pinByHash" permission (or admin scope).' : '';
    throw new Error(`Pin request for ${cid} failed with HTTP ${response.status}: ${text.slice(0, 300)}${hint}`);
  }
}

async function isPinned(cid, token, fetchImpl = fetch) {
  const response = await fetchImpl(`${LIST_URL}?hashContains=${cid}&status=pinned&pageLimit=1`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) return false;
  const data = await response.json();
  return (data.rows || []).some(row => row.ipfs_pin_hash === cid);
}

async function waitPinned(cid, token, { fetchImpl = fetch, timeoutMs = 15 * 60 * 1000, intervalMs = 20000, sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await isPinned(cid, token, fetchImpl)) return true;
    if (Date.now() >= deadline) return false;
    await sleep(intervalMs);
  }
}

async function pinRepoFolder(dir, { repo, commit, label, token, fetchImpl = fetch, pinFolderImpl = pinFolder, listFiles = listRepoFiles } = {}) {
  const files = listFiles(dir);
  if (!files.includes('index.html')) throw new Error(`${repo} has no index.html at its root; it is not a static site.`);
  const cid = await pinFolderImpl(files, token, { root: dir, name: `${label} ${commit.slice(0, 7)}`, folder: repo.split('/')[1], fetchImpl });
  const bytes = files.reduce((sum, rel) => sum + fs.statSync(path.join(dir, rel)).size, 0);
  return { cid, label, uri: `ipfs://${cid}`, status: 'pinned', source: { repo, commit }, fileCount: files.length, bytes, confirmedAt: new Date().toISOString() };
}

// Tracked files only, minus dot-paths (.github, .gitignore) that a website never serves.
function listRepoFiles(dir) {
  return execFileSync('git', ['-C', dir, 'ls-files', '-z'], { encoding: 'utf8' }).split('\0')
    .filter(rel => rel && !rel.split('/').some(part => part.startsWith('.')))
    .filter(rel => fs.statSync(path.join(dir, rel)).isFile());
}

async function main() {
  const token = process.env.PINATA_JWT;
  if (!token) throw new Error('PINATA_JWT is required; configure it as a GitHub Actions secret.');
  const label = String(process.env.LABEL || '').trim().slice(0, 80);
  if (!label) throw new Error('Provide a label naming the project or release.');
  const rows = [];
  if (process.env.SOURCE_DIR) {
    const repo = String(process.env.SOURCE_REPO || '');
    if (!REPO.test(repo)) throw new Error(`Invalid repository: ${repo}`);
    const commit = execFileSync('git', ['-C', process.env.SOURCE_DIR, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const row = await pinRepoFolder(process.env.SOURCE_DIR, { repo, commit, label, token });
    rows.push(row);
    console.log(`Pinned ${row.fileCount} files from ${repo}@${commit.slice(0, 7)} to ${row.uri}`);
  }
  const cids = parseList(process.env.CIDS, CID_V1, 'CIDv1');
  if (!cids.length && !rows.length) throw new Error('Provide a source repository or at least one CID.');
  const hosts = parseList(process.env.HOSTS, MULTIADDR, 'host multiaddr');
  for (const cid of cids) {
    const requestedAt = new Date().toISOString();
    await requestPin(cid, label, hosts, token);
    const pinned = await waitPinned(cid, token);
    rows.push({ cid, label, uri: `ipfs://${cid}`, status: pinned ? 'pinned' : 'requested', requestedAt, ...(pinned ? { confirmedAt: new Date().toISOString() } : {}) });
    console.log(`${pinned ? 'Pinned' : 'Requested (not yet confirmed)'} ${cid} — ${label}`);
  }
  const manifest = mergePins(readManifest(), rows);
  fs.writeFileSync(`${MANIFEST_PATH}.tmp`, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.renameSync(`${MANIFEST_PATH}.tmp`, MANIFEST_PATH);
  if (rows.some(row => row.status !== 'pinned')) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(error => {
    console.error(`[pinAgencyCids] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { parseList, mergePins, requestPin, waitPinned, pinRepoFolder, listRepoFiles, CID_V1, MULTIADDR, REPO };
