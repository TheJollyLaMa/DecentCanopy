'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PATHS = {
  config: path.join(ROOT, 'community-rewards.json'),
  creators: path.join(ROOT, 'data', 'community-creators.json'),
  pinners: path.join(ROOT, 'data', 'community-pinners.json'),
  queue: path.join(ROOT, 'payroll-queue.json'),
  accounts: path.join(ROOT, 'contributor-accounts.json'),
  backup: path.join(ROOT, 'data', 'ipfs-backup.json'),
};
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const GITHUB_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const NO_RESPONSE = new Set(['', '_no response_', 'none', 'n/a']);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

// GitHub issue forms render each field as "### <label>\n\n<value>".
function parseIssueForm(body) {
  const fields = {};
  const sections = String(body || '').replace(/\r\n/g, '\n').split(/^###\s+/m).slice(1);
  for (const section of sections) {
    const newline = section.indexOf('\n');
    const label = (newline < 0 ? section : section.slice(0, newline)).trim();
    const value = newline < 0 ? '' : section.slice(newline + 1).trim();
    fields[label] = NO_RESPONSE.has(value.toLowerCase()) ? '' : value;
  }
  return fields;
}

function isChecked(value) {
  return /-\s*\[x\]/i.test(String(value || ''));
}

function cleanText(value, max) {
  return String(value || '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function httpsUrl(value, { hosts } = {}) {
  const input = String(value || '').trim();
  if (!input) return null;
  let url;
  try { url = new URL(input); } catch { throw new Error(`Not a valid URL: ${cleanText(input, 80)}`); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Links must use https:// and contain no credentials.');
  if (hosts && !hosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
    throw new Error(`Links must point to ${hosts.join(' or ')}.`);
  }
  return url.href;
}

function address(value, label) {
  const input = String(value || '').trim();
  if (!ADDRESS_RE.test(input) || /^0x0{40}$/i.test(input)) throw new Error(`${label} must be a 0x… address with 40 hex characters.`);
  return input;
}

function parseCoordinates(value) {
  const input = String(value || '').trim();
  if (!input) return null;
  const match = input.match(/^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!match) throw new Error('Coordinates must look like "45.5, -122.7".');
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error('Latitude must be -90..90 and longitude -180..180.');
  return { latitude, longitude };
}

function parseLocation(fields) {
  const precisionText = String(fields['Show me on the globe'] || '').toLowerCase();
  const label = cleanText(fields['Location label'], 120);
  if (!precisionText || precisionText.startsWith("don't") || !label) return null;
  const precision = precisionText.startsWith('country') ? 'country' : precisionText.startsWith('city') ? 'city' : null;
  if (!precision) return null;
  const coordinates = parseCoordinates(fields['Approximate coordinates']);
  const digits = precision === 'city' ? 1 : 0;
  return {
    consent: true,
    precision,
    label,
    ...(coordinates ? {
      latitude: Number(coordinates.latitude.toFixed(digits)),
      longitude: Number(coordinates.longitude.toFixed(digits)),
    } : {}),
  };
}

function parseAirdropClaim(body) {
  const fields = parseIssueForm(body);
  if (!isChecked(fields['Publishing consent'])) {
    throw new Error('Please tick the publishing consent box; the claim publishes your creator blip in the public dataset.');
  }
  const projects = String(fields['Your Artizen projects'] || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 12)
    .map(link => httpsUrl(link, { hosts: ['artizen.fund'] }));
  const connected = String(fields['Connected wallet (optional)'] || '').trim();
  return {
    artizenWallet: address(fields['Artizen wallet address'], 'Artizen wallet address'),
    displayName: cleanText(fields['Creator name'], 80) || null,
    projectLinks: projects,
    website: httpsUrl(fields['Website (optional)']),
    connectedWallet: connected ? address(connected, 'Connected wallet') : null,
    sharedLocation: parseLocation(fields),
  };
}

function parsePinnerRequest(body) {
  const fields = parseIssueForm(body);
  if (!isChecked(fields['Pinning commitment'])) throw new Error('Please tick the pinning commitment box.');
  const gateway = httpsUrl(fields['Gateway URL']);
  if (!gateway) throw new Error('A public HTTPS gateway URL is required.');
  return {
    wallet: address(fields['Base wallet for ART rewards'], 'Base wallet for ART rewards'),
    gateway: gateway.replace(/\/+$/, '').replace(/\/ipfs$/, ''),
    provider: cleanText(fields['Pinning setup'], 60) || 'other',
  };
}

function artizenSlug(link) {
  const match = String(link || '').match(/^https:\/\/(?:www\.)?artizen\.fund\/index\/p\/([A-Za-z0-9_-]+)/);
  return match ? match[1].toLowerCase() : null;
}

function communityCreatorId(github) {
  return `community-creator:${String(github).toLowerCase()}`;
}

function isoWeek(date = new Date()) {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((day - yearStart) / 86400000 + 1) / 7);
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function validGithub(login) {
  return GITHUB_RE.test(String(login || ''));
}

/*
 * Airdrop and pinner payouts are not paid to the contributor whitelist: airdrops go to the
 * on-chain-verified Artizen wallet in data/community-creators.json and pinner rewards go to
 * owner-approved wallets in data/community-pinners.json.
 */
function registeredRecipient(entry, { accounts, creators, pinners }) {
  const role = String(entry.role || 'contributor').toLowerCase();
  const github = String(entry.contributorGithub || '').toLowerCase();
  if (role === 'airdrop') {
    const creator = (creators?.creators || []).find(row => String(row.github).toLowerCase() === github && row.claimIssue === entry.issueRef);
    return creator ? creator.artizenWallet : null;
  }
  if (role === 'pinner') {
    const pinner = (pinners?.pinners || []).find(row => String(row.github).toLowerCase() === github && row.status === 'approved');
    return pinner ? pinner.wallet : null;
  }
  const account = (accounts?.contributors || []).find(row => String(row.github).toLowerCase() === github);
  return account ? account.walletAddress : null;
}

module.exports = {
  ADDRESS_RE,
  PATHS,
  artizenSlug,
  communityCreatorId,
  isoWeek,
  parseAirdropClaim,
  parseIssueForm,
  parsePinnerRequest,
  readJson,
  registeredRecipient,
  validGithub,
  writeJson,
};
