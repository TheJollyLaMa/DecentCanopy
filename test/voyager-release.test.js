'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const data = require('../data/agency-map.json');
const Model = require('../scripts/data-adapter/agency-adapter');
const Cards = require('../scripts/agency-map');
const escape = value => String(value ?? '').replace(/[&<>"']/g, character =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

test('Voyager replaces the legacy repo identity without breaking existing map edges', () => {
  const voyager = data.projects.find(project => project.id === 'asteroid');
  assert.equal(voyager.repo, 'TheJollyLaMa/DecentVoyager');
  assert.equal(voyager.name, 'Decent Voyager');
  assert.equal(voyager.ens, 'voyager.decentagency.eth');
  assert.equal(data.projects.filter(project => project.repo === voyager.repo).length, 1);
  assert.ok(voyager.evidence.some(item => item.url.endsWith('/supporter-minted.json')));
  assert.match(voyager.currentState, /token 80.*listing 19/i);
  assert.match(voyager.reviewCaveats.join(' '), /710-NFT reserve and 10,000 BNut/);
  assert.ok(voyager.updates.some(update => update.evidence.some(item => item.url.endsWith('/base-reserves.json'))));
  assert.ok(data.relationships.some(link => link.source === voyager.id && link.target === 'planning-office' && link.state === 'proposed'));
  assert.ok(data.relationships.some(link => link.source === voyager.id && link.target === 'decent-busking' && link.state === 'proposed'));
  const graph = Model.transform(data);
  const entities = Object.fromEntries(graph.projects.map(item => [item.id, item]));
  const html = Cards.render(entities['agency-project:asteroid'], entities, graph.associations, escape, Model);
  assert.match(html, /Decent Voyager/);
  assert.match(html, /supporter-minted\.json/);
  assert.match(html, /listingId=19/);
  assert.doesNotMatch(html, /Small browserify canvas Asteroids game|npm test is a placeholder/);
});
