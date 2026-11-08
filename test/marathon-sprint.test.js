'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Model = require('../scripts/data-adapter/agency-adapter');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/agency-map.json'), 'utf8'));
const record = fs.readFileSync(path.join(__dirname, '../wiki/Marathon-Sprint.md'), 'utf8');

test('six administrative releases use published evidence and retain deployment limitations', () => {
  const graph = Model.transform(data);
  for (const id of ['escrow', 'invoice', 'subscriptions', 'nda', 'airdrop', 'ucann']) {
    const node = graph.projects.find(project => project.id === `agency-project:${id}`);
    assert.equal(node.agencyDetails.reviewedAt, '2026-11-08');
    const update = node.agencyDetails.updates.find(item => item.label.startsWith('Marathon:'));
    assert.equal(update.state, 'merged');
    assert.ok(update.evidence.some(item => /github\.com\/.+\/pull\/\d+$/.test(item.url)));
    assert.match(update.detail, /deployment|deployed|no agreement uploads or on-chain integration/);
    assert.doesNotMatch(JSON.stringify(update), /\/Users\/|session-state|localhost/);
  }
});

test('public sprint record links verified frontend entries without implying ENS or financial deployment', () => {
  for (const entry of [
    'DecentEscrow/', 'DecentInvoice/', 'DecentSubscriptions/public/index.html',
    'Decent_NDA/private-agreement.html', 'DecentAirdrop/',
    'Decent_UCAN_Play/modern.html', 'DecentHead/'
  ]) {
    assert.ok(record.includes(`https://thejollylama.github.io/${entry}`), entry);
  }
  assert.match(record, /disconnected wallet with no\s+authorization prompt/);
  assert.match(record, /Pages publication does not repoint an existing ENS\/IPFS snapshot/);
  assert.match(record, /No connected\s+wallet transactions or live provider uploads were exercised/);
  assert.equal(data.reviewedAt, '2026-10-22');
});

test('Siddhi product consolidation retains source identities without claiming sensor integration', () => {
  const siddhi = data.projects.find(project => project.id === 'jolly-sim-siddhi');
  const arduino = data.projects.find(project => project.id === 'arduino-smarthome');
  assert.match(siddhi.repositoryNote, /One future project site and header/);
  assert.match(arduino.purpose, /not a second/);
  assert.equal(siddhi.updates[0].state, 'planned');
  assert.match(siddhi.updates[0].detail, /optional and many-to-many/);
  assert.match(siddhi.updates[0].detail, /currently has a ledger/);
  assert.notEqual(siddhi.repo, arduino.repo);
});
