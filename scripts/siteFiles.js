'use strict';
// The public website: one list shared by GitHub Pages (publish-site.yml) and the IPFS site pin (pinSite.js).
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SITE_ENTRIES = [
  'index.html',
  'assets',
  'styles',
  'scripts',
  'data',
  'rabbit-hole',
  'contributor-accounts.json',
  'payroll-assets.json',
  'payroll-queue.json',
  'community-rewards.json',
];
const IGNORED = new Set(['.DS_Store', 'Thumbs.db']);

function listSiteFiles(root = ROOT) {
  const files = [];
  const walk = rel => {
    const abs = path.join(root, rel);
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      fs.readdirSync(abs).sort().forEach(name => { if (!IGNORED.has(name) && !name.startsWith('.')) walk(path.posix.join(rel, name)); });
    } else if (stat.isFile()) {
      files.push(rel);
    }
  };
  SITE_ENTRIES.forEach(walk);
  return files.sort();
}

function stageSite(target, root = ROOT) {
  const files = listSiteFiles(root);
  files.forEach(rel => {
    const dest = path.join(target, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(root, rel), dest);
  });
  return files;
}

if (require.main === module) {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: node scripts/siteFiles.js <target-directory>');
    process.exit(1);
  }
  console.log(`Staged ${stageSite(path.resolve(target)).length} site files into ${target}.`);
}

module.exports = { SITE_ENTRIES, listSiteFiles, stageSite };
