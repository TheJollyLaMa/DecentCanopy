'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Model = require('../scripts/data-adapter/agency-adapter');
const Cards = require('../scripts/agency-map');
const fixture = () => JSON.parse(fs.readFileSync(path.join(__dirname, '../data/agency-map.json'), 'utf8'));
const escape = value => String(value ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

test('independent router and lateral lending share source, never funds or completed deployments', () => {
  const graph = Model.transform(fixture());
  const router = graph.projects.find(p => p.id === 'agency-project:decent-settlements-router');
  const lending = graph.projects.find(p => p.id === 'agency-project:artfi');
  assert.notEqual(router.id, lending.id);
  assert.equal(router.repoUrl, lending.repoUrl);
  assert.equal(router.raised, null);
  assert.equal(router.goal, null);
  const path = graph.associations.find(edge => edge.source === lending.id && edge.target === router.id);
  assert.equal(path.relationshipState, 'proposed');
});

test('current brief separates merged local work, unmerged builds and financial consolidation', () => {
  const graph = Model.transform(fixture());
  const byId = Object.fromEntries(graph.projects.map(p => [p.id, p]));
  const html = key => Cards.render(byId[`agency-project:${key}`], byId, graph.associations, escape, Model);
  assert.match(html('big-nuten'), /#412/);
  assert.match(html('big-nuten'), /not automatic cross-browser sync|does not provide automatic cross-browser sync/);
  assert.match(html('big-nuten'), /MERGED SOURCE/);
  assert.match(html('big-nuten'), /PLANNED \/ NOT DELIVERED/);
  assert.match(html('pilgrimages'), /OPEN PR \/ NOT MERGED/);
  assert.match(html('pilgrimages'), /35 contract\/offline, 44 UI and 6 Chromium/);
  assert.match(html('babel-bet'), /16 reported/);
  assert.match(html('babel-bet'), /No new game/);
  assert.equal(byId['agency-project:big-nuten'].agencyDetails.reviewedAt, '2026-11-03');
  assert.equal(byId['agency-project:head'].agencyDetails.reviewedAt, '2026-10-22');
});

test('bad dates, duplicate identities and unsupported update evidence fail explicitly', () => {
  for (const mutate of [
    p => { p.reviewedAt = '2026-02-30'; },
    p => { p.entityId = 'UPPER'; },
    p => { p.updates = [{ state: 'deployed', label: 'No', detail: 'No', evidence: [] }]; },
    p => { p.updates[0].evidence = []; },
    p => { p.updates[0].evidence[0].url = 'javascript:alert(1)'; }
  ]) {
    const data = fixture();
    mutate(data.projects.find(p => p.id === 'big-nuten'));
    assert.throws(() => Model.transform(data));
  }
  const duplicate = fixture();
  duplicate.projects.find(p => p.id === 'artfi').entityId = 'decent-settlements-router';
  assert.throws(() => Model.transform(duplicate), /Duplicate independent entity/);
});

test('latest cards escape curated update fields while retaining disclosure-based reading', () => {
  const data = fixture(), marker = '<script>alert(1)</script>';
  const update = data.projects.find(p => p.id === 'big-nuten').updates[0];
  update.label = marker; update.detail = marker; update.evidence[0].label = marker;
  const graph = Model.transform(data), byId = Object.fromEntries(graph.projects.map(p => [p.id, p]));
  const html = Cards.render(byId['agency-project:big-nuten'], byId, graph.associations, escape, Model);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<details class="details-group"><summary>Current understanding/);
});

test('all three existing widget identities link published clone guides and historical support evidence', () => {
  const data = fixture();
  for (const [id, ens, token] of [
    ['decent-jukebox', 'djuke.decentagency.eth', 72],
    ['dvert', 'dvert.decentagency.eth', 73],
    ['dbusk-radio', 'dbusk.decentagency.eth', 74]
  ]) {
    const project = data.projects.find(p => p.id === id);
    assert.equal(project.ens, ens);
    assert.match(project.currentState, new RegExp(`token ${token}`));
    assert.match(project.currentState, /not current/);
    assert.equal(project.updates[0].state, 'merged');
    assert.ok(project.updates[0].evidence.some(row => /\/blob\/[a-f0-9]{40}\/docs\/CLONE_AND_ADAPT\.md$/.test(row.url)));
    assert.ok(project.updates[0].evidence.some(row => row.url.endsWith('/supporter-mint-evidence.json')));
    assert.ok(project.updates[0].evidence.some(row => row.url.endsWith('/supporter-listing-evidence.json')));
  }
});

test('Calendar has an explicit public repository without claiming a deployed application', () => {
  const calendar = fixture().projects.find(project => project.id === 'calendar');
  assert.equal(calendar.repo, 'TheJollyLaMa/DecentCalendar');
  assert.match(calendar.repositoryNote, /have not been verified/);
  assert.match(calendar.currentState, /public committed preparation, not evidence of a published GitHub release/);
  assert.ok(calendar.evidence.some(row => row.url === `https://github.com/${calendar.repo}`));
});
