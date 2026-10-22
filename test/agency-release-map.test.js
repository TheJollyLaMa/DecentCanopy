'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Model = require('../scripts/data-adapter/agency-adapter');
const Cards = require('../scripts/agency-map');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/agency-map.json'), 'utf8'));
const project = id => data.projects.find(item => item.id === id);
const evidence = (id, asset) => project(id).evidence.some(item => item.url.endsWith(`/${asset}`));
const escape = value => String(value ?? '').replace(/[&<>"']/g, character =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

test('release closeout is discoverable with per-project evidence, not implied live synchronization', () => {
  assert.equal(data.reviewedAt, '2026-10-22');
  assert.match(data.sourceLabel, /individual review dates/);
  assert.match(data.sourceLabel, /not live GitHub or chain synchronization/);
  for (const id of ['head', 'market']) {
    assert.ok(evidence(id, 'supporter-evidence.json'));
    assert.ok(evidence(id, 'supporter-discord-sent.json'));
    assert.match(project(id).reviewCaveats.join(' '), /before buying|before|rechecked/);
  }
  assert.match(project('head').currentState, /v2\.0\.0/);
  assert.match(project('market').currentState, /v0\.3\.1/);
  assert.match(project('head').reviewCaveats.join(' '), /token 70 \/ listing 0/);
  assert.match(project('market').currentState, /token 71 \/ listing 1/);
});

test('Head and Market cards render the completed proof and explicit open boundaries', () => {
  const graph = Model.transform(data);
  const entities = Object.fromEntries(graph.projects.map(item => [item.id, item]));
  const render = id => Cards.render(entities[`agency-project:${id}`], entities, graph.associations, escape, Model);
  const head = render('head');
  const market = render('market');
  assert.match(head, /v2\.0\.0/);
  assert.match(head, /Market is the first verified external pinned consumer/);
  assert.match(head, /Preserve Canopy&#39;s working forest header/);
  assert.doesNotMatch(head, /v1\.0\.0 stable|Current issue listing returned no open issues/);
  assert.match(market, /v0\.3\.1/);
  assert.match(market, /supporter-evidence\.json/);
  assert.match(market, /supporter-discord-sent\.json/);
  assert.match(market, /Never mint the superseded v0\.3\.0/);
  assert.match(market, /issue #47 remains open/);
  assert.match(market, /not a deployable website root/);
  assert.doesNotMatch(market, /Tests exist but were not run|README says sale listings/);
  assert.ok(project('market').offers.some(item => item.id === 'supporter-release-studio'));
  assert.ok(project('head').offers.some(item => item.id === 'supporter-release-announcer'));
  assert.ok(project('market').needs.some(item => item.id === 'decentmarket-creator-minting'));
});

test('integrated Footer and Canvas work is not presented as independent releases or public repository identities', () => {
  for (const id of ['canvas', 'footer']) {
    assert.equal(project(id).repo, undefined);
    assert.match(project(id).currentState, /inside Market v0\.3\.1/);
    assert.match(project(id).currentState, /not a standalone|remain pending/);
    assert.match(project(id).nextAction, /before/);
    assert.ok(project(id).evidence.some(item => item.url.endsWith('/v0.3.1')));
  }
});
