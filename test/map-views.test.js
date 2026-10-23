'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

async function load(search) {
  const project = (id, extra = {}) => ({
    id, name: id, track: 'Projects', status: 'active', raised: null, goal: null, ...extra
  });
  const archive = project('artizen-project:archive');
  const creator = project('decent-creator:wallet', { kind: 'creator', creatorRecord: { wallet: 'wallet' } });
  const signedProject = project('decent-project:wallet:project', { creatorRecord: creator.creatorRecord });
  const repository = project('github-repo:owner/repo', { kind: 'repository', creatorRecord: creator.creatorRecord });
  const local = project('local-creator:me', { kind: 'creator' });
  const base = {
    projects: [archive, project('artizen-fund:fund', { kind: 'fund' })],
    associations: [{ source: archive.id, target: 'artizen-fund:fund' }],
    activity: [{ type: 'update', date: '2026-10-23', projectId: archive.id }]
  };
  let creatorCalls = 0, participationCalls = 0;
  const sandbox = {
    URLSearchParams, console,
    window: {
      location: { search },
      CanopyParticipation: { overlay(data) {
        participationCalls++;
        return { ...data, projects: [...data.projects, local] };
      } },
      DecentCreators: { async overlay(data) {
        creatorCalls++;
        return {
          ...data, projects: [...data.projects, creator, signedProject, repository],
          associations: [...data.associations,
            { source: creator.id, target: signedProject.id },
            { source: signedProject.id, target: repository.id },
            { source: signedProject.id, target: archive.id }]
        };
      } }
    },
    GTPModeRouter: { getModeInfo: () => ({ mode: search.includes('mode=app') ? 'app' : 'prototype' }) },
    GTPDataAdapterInterface: { assertAdapter: adapter => adapter },
    GTPArtizenDataAdapter: { create: () => ({
      getProjects: async () => base.projects, getAssociations: async () => base.associations,
      getActivity: async () => base.activity, getMetrics: async () => ({})
    }) },
    GTPAppDataAdapter: { create: () => ({
      getProjects: async () => [project('onchain:project')],
      getAssociations: async () => [], getActivity: async () => [], getMetrics: async () => ({})
    }) }
  };
  vm.runInNewContext(read('scripts/data-layer.js'), sandbox);
  await sandbox.GTPData.load();
  return { data: sandbox.GTPData, creatorCalls, participationCalls };
}

test('Whole Canopy and legacy Creators URLs expose the same non-archive graph to all consumers', async () => {
  const whole = await load('');
  const creators = await load('?canopy=creators');
  const ids = data => Array.from(data.getProjects(), node => node.id);
  assert.deepEqual(ids(whole.data), ids(creators.data));
  assert.deepEqual(ids(whole.data), [
    'local-creator:me', 'decent-creator:wallet', 'decent-project:wallet:project', 'github-repo:owner/repo'
  ]);
  assert.equal(whole.data.getAssociations().length, 2);
  const visible = new Set(ids(whole.data));
  assert.ok(whole.data.getAssociations().every(edge => visible.has(edge.source) && visible.has(edge.target)));
  assert.equal(whole.data.getActivity().length, 0);
  assert.equal(whole.creatorCalls, 1);
  assert.equal(whole.participationCalls, 1);
});

test('archive retains its original graph without creator or local overlays', async () => {
  const archive = await load('?canopy=artizen');
  assert.equal(archive.data.getProjects().length, 2);
  assert.equal(archive.data.getAssociations().length, 1);
  assert.equal(archive.data.getActivity().length, 1);
  assert.equal(archive.creatorCalls, 0);
  assert.equal(archive.participationCalls, 0);
});

test('Green Tea keeps archive context available to its existing cluster filter', async () => {
  const greenTea = await load('?canopy=green-tea');
  assert.ok(greenTea.data.getProjectById('artizen-project:archive'));
  assert.ok(greenTea.data.getProjectById('decent-project:wallet:project'));
});

test('explicit app mode remains on-chain and does not become the creator view', async () => {
  const app = await load('?mode=app');
  assert.deepEqual(Array.from(app.data.getProjects(), node => node.id), ['onchain:project']);
  assert.equal(app.creatorCalls, 0);
});

test('one labeled dropdown lists Agency first and Artizen last without a duplicate creator option', () => {
  const html = read('index.html');
  const select = html.match(/<select id="canopy-map">([\s\S]*?)<\/select>/)[1];
  assert.deepEqual([...select.matchAll(/<option value="([^"]+)"/g)].map(match => match[1]),
    ['agency', 'creators', 'green-tea', 'artizen']);
  assert.match(html, /<label class="canopy-switch" for="canopy-map">/);
  assert.match(select, /Whole Canopy · Decent Creators/);
  assert.doesNotMatch(html, /<a[^>]+href="\?canopy=creators"/);
});
