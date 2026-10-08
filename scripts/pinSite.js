'use strict';
// Pins the whole public website to IPFS as one folder, so the canopy opens from any IPFS gateway.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { listSiteFiles } = require('./siteFiles');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'ipfs-site.json');
const PIN_URL = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
const UNPIN_URL = 'https://api.pinata.cloud/pinning/unpin/';
const FOLDER = 'decentcanopy';
const KEEP_VERSIONS = 5;
const CID_V1 = /^baf[a-z2-7]{20,100}$/;

function siteUrls(cid) {
  return {
    inbrowser: `https://${cid}.ipfs.inbrowser.link/`,
    dweb: `https://${cid}.ipfs.dweb.link/`,
    pinata: `https://gateway.pinata.cloud/ipfs/${cid}/`,
  };
}

function digestSite(files, root = ROOT) {
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  files.forEach(rel => {
    const content = fs.readFileSync(path.join(root, rel));
    bytes += content.length;
    hash.update(rel).update('\0').update(crypto.createHash('sha256').update(content).digest()).update('\0');
  });
  return { siteSha256: hash.digest('hex'), bytes };
}

function readManifest() {
  try { return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')); } catch { return null; }
}

function nextRecent(previous, current) {
  const rows = [current, ...((previous && previous.recent) || [])];
  const seen = new Set();
  const unique = rows.filter(row => row && CID_V1.test(row.cid) && !seen.has(row.cid) && seen.add(row.cid));
  return { keep: unique.slice(0, KEEP_VERSIONS), drop: unique.slice(KEEP_VERSIONS) };
}

async function pinFolder(files, token, { root = ROOT, name, fetchImpl = fetch } = {}) {
  const form = new FormData();
  files.forEach(rel => form.append('file', new Blob([fs.readFileSync(path.join(root, rel))]), `${FOLDER}/${rel}`));
  form.append('pinataMetadata', JSON.stringify({ name }));
  form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));
  const response = await fetchImpl(PIN_URL, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form, signal: AbortSignal.timeout(5 * 60 * 1000),
  });
  const text = await response.text();
  if (!response.ok) {
    const hint = response.status === 401 || response.status === 403
      ? ' The PINATA_JWT key needs the legacy "pinFileToIPFS" permission (or admin scope) to upload folders.' : '';
    throw new Error(`Pinata folder upload failed with HTTP ${response.status}: ${text.slice(0, 300)}${hint}`);
  }
  const cid = JSON.parse(text).IpfsHash;
  if (!CID_V1.test(cid || '')) throw new Error('Pinata did not return a valid folder CID.');
  return cid;
}

async function main() {
  const token = process.env.PINATA_JWT;
  if (!token) throw new Error('PINATA_JWT is required; configure it as a GitHub Actions secret.');
  const files = listSiteFiles();
  if (!files.includes('index.html') || !files.includes('rabbit-hole/index.html')) throw new Error('The staged site is missing its entry pages.');
  const { siteSha256, bytes } = digestSite(files);
  const previous = readManifest();
  if (previous?.siteSha256 === siteSha256 && CID_V1.test(previous.cid || '') && process.env.FORCE_PIN !== 'true') {
    console.log(`Site unchanged; the IPFS copy is still ${previous.urls.inbrowser}`);
    return;
  }
  const pinnedAt = new Date().toISOString();
  const cid = await pinFolder(files, token, { name: `DecentCanopy site ${pinnedAt}` });
  const commit = process.env.GITHUB_SHA || null;
  const { keep, drop } = nextRecent(previous, { cid, pinnedAt, commit });
  const manifest = {
    format: 'decentcanopy-site-pin', version: 1, provider: 'Pinata',
    cid, uri: `ipfs://${cid}`, urls: siteUrls(cid), pinnedAt, commit,
    siteSha256, fileCount: files.length, bytes, recent: keep,
  };
  fs.writeFileSync(`${MANIFEST_PATH}.tmp`, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.renameSync(`${MANIFEST_PATH}.tmp`, MANIFEST_PATH);
  console.log(`Pinned ${files.length} site files (${(bytes / 1048576).toFixed(1)} MB) to ${manifest.uri}`);
  console.log(`Open: ${manifest.urls.inbrowser}`);
  for (const old of drop) {
    // Older versions are released so storage stays bounded; anyone may keep pinning them independently.
    const response = await fetch(UNPIN_URL + old.cid, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }).catch(error => ({ ok: false, status: error.message }));
    console.log(response.ok ? `Released old site version ${old.cid}` : `Could not release ${old.cid} (${response.status}); leaving it pinned.`);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(`[pinSite] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { digestSite, nextRecent, pinFolder, siteUrls, KEEP_VERSIONS };
