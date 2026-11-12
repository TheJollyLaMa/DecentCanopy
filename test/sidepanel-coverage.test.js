'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Model = require('../scripts/data-adapter/agency-adapter');
const Cards = require('../scripts/agency-map');
const Activity = require('../scripts/repository-activity');
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const data = file => JSON.parse(fs.readFileSync(new URL(`../data/${file}`, `file://${__filename}`), 'utf8'));

test('all agency project and repository sidepanels have dated plans, source/unknown boundaries and connection empty states', () => {
  const graph = Model.transform(data('agency-map.json'));
  const entities = Object.fromEntries(graph.projects.map(node => [node.id, node]));
  for (const node of graph.projects) {
    const html = Cards.render(node, entities, graph.associations, escape, Model);
    assert.match(html, /Planning notes below are dated source reviews/);
    assert.match(html, /Next useful move/);
    assert.match(html, node.repoUrl ? /Public source repository/ : /No public repository identity/);
    assert.doesNotMatch(html, /\bundefined\b|<ul><\/ul>/);
  }
  const shared = graph.projects.find(node => node.kind === 'repository' && node.repoUrl.endsWith('/ArtFi'));
  const html = Cards.render(shared, entities, graph.associations, escape, Model);
  assert.match(shared.agencyDetails.currentState, /Shared source repository/);
  assert.match(html, /Separate project contexts \(2\)/);
  assert.match(html, /DecentSettlementsRouter/);
  assert.match(html, /DecentLending/);
  assert.deepEqual(shared.agencyDetails.offers, []);
});

test('published public work samples cover all catalog observations without treating closures as mergers', () => {
  const snapshot = Activity.validate(data('repository-activity.json'));
  assert.ok(snapshot.repositories.length >= 30);
  for (const row of snapshot.repositories) {
    if (row.status === 'unavailable') continue;
    assert.ok(row.work, `${row.repo}: work observation absent`);
    assert.ok(row.work.open.length <= 10 && row.work.recent.length <= 10);
  }
  const row = snapshot.repositories.find(row => row.work?.open.length);
  const invalid = structuredClone(snapshot);
  invalid.repositories.find(item => item.repo === row.repo).work.open[0].url = 'https://github.com/wrong/repo/issues/1';
  assert.throws(() => Activity.validate(invalid), /work evidence/);
});
