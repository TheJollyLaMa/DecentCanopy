'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Model = require('../scripts/data-adapter/agency-adapter');
const Cards = require('../scripts/agency-map');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/agency-map.json'), 'utf8'));

test('DLang stays planned within the existing BabelBet project and renders its public intent', () => {
  const graph = Model.transform(data);
  const byId = Object.fromEntries(graph.projects.map(project => [project.id, project]));
  const project = byId['agency-project:babel-bet'];
  const update = project.agencyDetails.updates.find(update => update.label.startsWith('DLang:'));
  assert.equal(update.state, 'planned');
  assert.match(update.detail, /BabelBet \/ DuoDuel/);
  assert.match(update.detail, /seek-and-find scenes/);
  assert.match(update.detail, /many visual exemplars/);
  assert.match(update.detail, /three or more languages simultaneously/);
  assert.match(update.detail, /not a delivered game/);
  assert.equal(update.evidence[0].url, 'https://github.com/TheJollyLaMa/BabelBet/issues/6');
  assert.equal(project.agencyDetails.reviewedAt, '2026-11-10');
  assert.ok(project.agencyDetails.needs.some(need => need.id === 'dlang-visual-multilingual'));
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const html = Cards.render(project, byId, graph.associations, escape, Model);
  assert.match(html, /DLang:/);
  assert.match(html, /PLANNED \/ NOT DELIVERED/);
  assert.match(html, /issues\/6/);
  assert.match(html, /PR #5 is unmerged/);
});
