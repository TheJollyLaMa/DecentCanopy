'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const HEAD_SHA = '599241344849af1921f6a9a59431f4b2f300d417';

test('own About Supporter card remains unavailable without published evidence', () => {
  const html = read('index.html');
  const card = html.match(/<section class="about-supporter[\s\S]*?<\/section>/)?.[0];
  assert.ok(card);
  assert.match(card, /data-supporter-state="preparing"/);
  assert.match(card, /1,000 editions at 10 USDC each on Base/);
  assert.match(card, /<button[^>]*disabled[^>]*aria-describedby="canopy-supporter-status"/);
  assert.match(card, /role="status"/);
  assert.match(card, /other independent projects/);
  assert.match(card, /not project ownership/);
  assert.doesNotMatch(card, /listingId|tokenId|supporter-purchase|onclick|<script/);
  const inventory = JSON.parse(read('data/supporter-dnfts.json'));
  assert.equal(inventory.tokens.some(token => /decentcanopy/i.test(JSON.stringify(token))), false);
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
  assert.match(canopy.nextAction, /No Canopy token or listing ID is assigned/);
  assert.equal(canopy.ens, 'decentcanopy.eth');
});

test('published previews and pending Canopy retain separate release versus mint evidence', () => {
  const data = JSON.parse(read('data/agency-map.json'));
  for (const id of ['calendar', 'pilgrimages', 'decent-canopy']) {
    const project = data.projects.find(row => row.id === id);
    const preparation = project.updates.find(update => /preview/.test(`${update.label} ${update.detail}`));
    assert.ok(preparation);
    assert.match(`${preparation.label} ${preparation.detail}`, /preview/);
    assert.ok(preparation.evidence.some(item => item.url.includes(`/${project.repo}/commit/`)));
    assert.match(project.nextAction, /No new ENS name|No Canopy token/);
  }
  for (const id of ['calendar', 'pilgrimages']) {
    const project = data.projects.find(row => row.id === id);
    assert.ok(project.updates.some(update => update.evidence.some(item => item.url.endsWith('/releases/tag/v0.1.0'))));
    assert.match(project.currentState, /preparation is running|v0\.1\.1 preparation is pending/);
    assert.match(project.currentState, /no own minted\/listed Supporter|not evidence of a minted\/listed Supporter/i);
  }
  const pilgrimages = data.projects.find(row => row.id === 'pilgrimages');
  assert.match(pilgrimages.currentState, /v0\.1\.0 remains frozen, unminted and superseded/);
});
