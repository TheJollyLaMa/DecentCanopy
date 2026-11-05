'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const HEAD_SHA = '599241344849af1921f6a9a59431f4b2f300d417';

test('own About Supporter card links only its verified token 79/listing 9 edition', () => {
  const html = read('index.html');
  const card = html.match(/<section class="about-supporter[\s\S]*?<\/section>/)?.[0];
  assert.ok(card);
  assert.match(card, /data-supporter-state="verified"/);
  assert.match(card, /1,000 editions at 10 USDC each on Base/);
  assert.match(card, /Token 79 · listing 9/);
  assert.match(card, /id="canopy-supporter-buy"/);
  assert.match(card, /nftContract=0xe63EC9f8228720bAAC2fD528C0A6d06B3Dc5439B&amp;tokenId=79/);
  assert.match(card, /rechecks price and stock/);
  assert.match(card, /role="status"/);
  assert.match(card, /other independent projects/);
  assert.match(card, /not project ownership/);
  assert.match(card, /\/v0\.1\.0\/supporter-minted\.json/);
  assert.doesNotMatch(card, /onclick|<script/);
  const inventory = JSON.parse(read('data/supporter-dnfts.json'));
  assert.ok(['ok', 'partial', 'unavailable'].includes(inventory.chains['8453'].status));
});

test('caller workflows use one immutable reviewed kit, exact root and approved terms', () => {
  for (const [file, workflow] of [
    ['supporter-release.yml', 'product-supporter-prepare.yml'],
    ['supporter-announce.yml', 'product-supporter-announce.yml'],
  ]) {
    const yaml = read(`.github/workflows/${file}`);
    assert.ok(yaml.includes(`${workflow}@${HEAD_SHA}`));
    assert.ok(yaml.includes(`head_ref: ${HEAD_SHA}`));
    assert.match(yaml, /group: supporter-\$\{\{ github.repository \}\}/);
    assert.doesNotMatch(yaml, /secrets:\s*inherit|PRIVATE_KEY|MNEMONIC/);
  }
  const prepare = read('.github/workflows/supporter-release.yml');
  assert.match(prepare, /site_root: '\.'/);
  assert.match(prepare, /preview_query: '\?canopy=agency'/);
  assert.match(prepare, /quantity: '1000'/);
  assert.match(prepare, /price_usdc: '10000000'/);
  assert.match(prepare, /vars.SUPPORTER_ENS_NAME/);
  assert.match(read('.github/workflows/supporter-announce.yml'), /vars.SUPPORTER_DISCORD_ENABLED == 'true'/);
  assert.ok(fs.existsSync(path.join(__dirname, '../index.html')));
});

test('PR 58 adaptation preserves main BigNuten evidence and independent Canopy identity', () => {
  const data = JSON.parse(read('data/agency-map.json'));
  const bigNuten = data.projects.find(project => project.id === 'big-nuten');
  const live = bigNuten.updates.find(update => update.label === 'v3.3.0 Supporter DNFT live on Base');
  assert.ok(live);
  assert.match(live.detail, /Token 76.*listing 6.*10 USDC/);
  assert.ok(live.evidence.some(item => item.url.endsWith('/pull/417')));
  assert.ok(live.evidence.some(item => item.url.endsWith('/supporter-art-refresh.json')));
  assert.equal(bigNuten.ens, 'bignuten.decentagency.eth');
  const canopy = data.projects.find(project => project.id === 'decent-canopy');
  assert.match(canopy.currentState, /token 79.*listing 9/);
  assert.equal(canopy.ens, 'decentcanopy.eth');
});

test('three published editions retain independent mint evidence and separate journey deployment gates', () => {
  const data = JSON.parse(read('data/agency-map.json'));
  for (const id of ['calendar', 'pilgrimages', 'decent-canopy']) {
    const project = data.projects.find(row => row.id === id);
    const proof = project.updates.flatMap(update => update.evidence).find(item => item.url.endsWith('/supporter-minted.json'));
    assert.ok(proof, id);
    assert.ok(proof.url.includes(`/${project.repo}/releases/download/`));
  }
  const pilgrimages = data.projects.find(row => row.id === 'pilgrimages');
  assert.match(pilgrimages.currentState, /v0\.1\.0 is superseded/);
  assert.match(pilgrimages.currentState, /does not activate Base journey contracts/);
});
