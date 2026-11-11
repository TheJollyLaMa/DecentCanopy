'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Model = require('../scripts/data-adapter/agency-adapter');
const Cards = require('../scripts/agency-map');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/agency-map.json'), 'utf8'));

test('DLang has an independent source and preview without implying funded launch or sandbox affiliation', () => {
  const graph = Model.transform(data);
  const byId = Object.fromEntries(graph.projects.map(project => [project.id, project]));
  const project = byId['agency-project:dlang'];
  assert.equal(project.repoUrl, 'https://github.com/TheJollyLaMa/DLang');
  assert.match(project.agencyDetails.currentState, /36 receiving tests/);
  assert.match(project.agencyDetails.currentState, /1,095 reproducible/);
  assert.match(project.agencyDetails.currentState, /signed production upload not performed/);
  assert.match(project.agencyDetails.currentState, /No funded round or payments enabled/);
  assert.match(project.agencyDetails.currentState, /Sourcify exactly matched/);
  assert.ok(project.agencyDetails.needs.some(need => need.id === 'dlang-pilot-gates'));
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const html = Cards.render(project, byId, graph.associations, escape, Model);
  assert.match(html, /Published preview/);
  assert.match(html, /Payments remain disabled/);
  assert.doesNotMatch(html, /BabelBet|DuoDuel/);
  assert.notEqual(project.id, byId['agency-project:babel-bet'].id);
  assert.ok(!byId['agency-project:babel-bet'].agencyDetails.updates.some(update => update.label.startsWith('DLang:')));
});
