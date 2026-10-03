/* global window, fetch */

var GTPArtizenDataAdapter = (function () {
  'use strict';

  var PROJECT_PREFIX = 'artizen-project:';
  var FUND_PREFIX = 'artizen-fund:';

  function assertArray(value, label) {
    if (!Array.isArray(value)) throw new Error('[GTPArtizenDataAdapter] Expected ' + label + ' to be an array');
    return value;
  }

  // Curated public links and read-only Artizen page captures are kept separate from
  // participant-reported fields (websiteUrl, funding) so the card can label provenance.
  function applyCuratedPublicData(entity, project) {
    if (!entity) return;
    if (Array.isArray(project.links)) entity.curatedLinks = project.links.slice();
    if (project.artizenPageUrl) entity.artizenPageUrl = project.artizenPageUrl;
    if (project.publicStats) entity.publicStats = project.publicStats;
    if (project.note) entity.curationNote = project.note;
  }

  function transform(snapshot, curation) {
    if (!snapshot || typeof snapshot !== 'object') {
      throw new Error('[GTPArtizenDataAdapter] Artizen snapshot is missing or invalid');
    }

    var projects = assertArray(snapshot.projects, 'projects');
    var funds = assertArray(snapshot.funds, 'funds');
    var associations = assertArray(snapshot.relationships, 'relationships');
    var entities = [];
    var idsBySlug = new Map();
    var idSet = new Set();

    projects.forEach(function (project) {
      if (!project.id || !project.slug || !project.name) return;
      var id = PROJECT_PREFIX + project.id;
      idSet.add(id);
      idsBySlug.set(project.slug, id);
      entities.push({
        id: id,
        name: project.name,
        kind: 'project',
        track: 'Projects',
        status: 'not-reported',
        raised: 0,
        goal: 0,
        description: project.description || '',
        tags: project.tags || [],
        facets: project.facets || [],
        image: project.image || null,
        slug: project.slug,
        artizenUrl: 'https://artizen.fyi/projects/' + encodeURIComponent(project.slug),
        artizenPageUrl: 'https://artizen.fund/index/p/' + encodeURIComponent(project.slug),
        sourceLabel: 'Artizen public project index',
        generatedAt: snapshot.generatedAt || null
      });
    });

    funds.forEach(function (fund) {
      if (!fund.id || !fund.slug || !fund.name) return;
      var id = FUND_PREFIX + fund.id;
      idSet.add(id);
      idsBySlug.set(fund.slug, id);
      entities.push({
        id: id,
        name: fund.name,
        kind: 'fund',
        track: 'Funds',
        status: fund.active === false ? 'inactive' : 'not-reported',
        raised: 0,
        goal: 0,
        available: typeof fund.available === 'number' ? fund.available : null,
        description: fund.description || fund.subtitle || '',
        image: fund.image || null,
        slug: fund.slug,
        artizenUrl: 'https://artizen.fyi/funds/' + encodeURIComponent(fund.slug),
        artizenPageUrl: 'https://artizen.fund/index/mf/' + encodeURIComponent(fund.slug),
        sourceLabel: 'Artizen public fund index',
        generatedAt: snapshot.generatedAt || null
      });
    });

    var creator = curation && curation.creator;
    if (creator && creator.id && creator.name) {
      idSet.add(creator.id);
      entities.push({
        id: creator.id,
        name: creator.name,
        kind: 'creator',
        track: 'Creators',
        status: 'curated',
        raised: 0,
        goal: 0,
        description: creator.description || '',
        sourceLabel: 'Creator-curated in DecentCanopy',
        curatedLinks: Array.isArray(creator.links) ? creator.links.slice() : [],
        artizenProfile: creator.artizenProfile || null,
        image: creator.image || null,
        imageSource: creator.imageSource || null,
        artizenPageUrl: creator.artizenPageUrl || null
      });
    }

    var entitiesById = new Map(entities.map(function (entity) { return [entity.id, entity]; }));
    var curatedProjects = curation && Array.isArray(curation.projects) ? curation.projects : [];
    curatedProjects.forEach(function (project) {
      if (!project.slug || !project.name) return;
      if (idsBySlug.has(project.slug)) {
        applyCuratedPublicData(entitiesById.get(idsBySlug.get(project.slug)), project);
        return;
      }
      var id = 'curated-project:' + project.slug;
      idsBySlug.set(project.slug, id);
      idSet.add(id);
      entities.push({
        id: id,
        name: project.name,
        kind: 'project',
        track: 'Projects',
        status: 'not-in-feed',
        raised: 0,
        goal: 0,
        description: project.description || 'This creator-curated entry was not found in the latest Artizen public index.',
        slug: project.slug,
        artizenUrl: project.searchUrl || null,
        sourceLabel: 'Creator-curated in DecentCanopy',
        dataState: 'not-in-feed'
      });
      applyCuratedPublicData(entities[entities.length - 1], project);
    });

    var edges = new Map();
    function addEdge(edge) {
      if (!edge || !edge.source || !edge.target || edge.source === edge.target) return;
      if (!idSet.has(edge.source) || !idSet.has(edge.target)) return;
      var key = [edge.source, edge.target, edge.type].sort().join('::');
      var existing = edges.get(key);
      if (!existing) {
        edges.set(key, {
          source: edge.source,
          target: edge.target,
          type: edge.type,
          sourceLabel: edge.sourceLabel || null,
          note: edge.note || null,
          seasonNumbers: edge.seasonNumber == null ? [] : [edge.seasonNumber],
          createdAt: edge.createdAt || null,
          records: edge.records || 1
        });
        return;
      }
      if (edge.seasonNumber != null && existing.seasonNumbers.indexOf(edge.seasonNumber) < 0) {
        existing.seasonNumbers.push(edge.seasonNumber);
      }
      if (edge.createdAt && (!existing.createdAt || edge.createdAt > existing.createdAt)) {
        existing.createdAt = edge.createdAt;
      }
      existing.records += edge.records || 1;
    }

    associations.forEach(function (edge) {
      addEdge({
        source: PROJECT_PREFIX + edge.projectId,
        target: FUND_PREFIX + edge.fundId,
        type: edge.kind,
        seasonNumber: edge.seasonNumber,
        createdAt: edge.createdAt,
        sourceLabel: 'Artizen public graph'
      });
    });

    (curation && Array.isArray(curation.associations) ? curation.associations : []).forEach(function (edge) {
      var source = edge.source === 'creator' ? (creator && creator.id) : idsBySlug.get(edge.sourceSlug);
      var target = edge.target === 'creator' ? (creator && creator.id) : idsBySlug.get(edge.targetSlug);
      addEdge({
        source: source,
        target: target,
        type: edge.type || 'curated-association',
        sourceLabel: edge.sourceLabel || 'Creator-curated in DecentCanopy',
        note: edge.note || null
      });
    });

    return {
      projects: entities,
      associations: Array.from(edges.values()),
      activity: [],
      metrics: {
        availableFunds: funds.reduce(function (sum, fund) {
          return sum + (typeof fund.available === 'number' ? fund.available : 0);
        }, 0),
        placeholder: false,
        source: 'Artizen public graph snapshot',
        generatedAt: snapshot.generatedAt || null,
        sourceCounts: {
          projects: projects.length,
          funds: funds.length,
          relationships: associations.length
        },
        dataNotes: Array.isArray(snapshot.dataNotes) ? snapshot.dataNotes.slice() : []
      }
    };
  }

  function create(options) {
    var basePath = (options && options.basePath) || '';
    var dataPromise = Promise.all([
      fetch(basePath + 'data/artizen.json').then(function (response) {
        if (!response.ok) throw new Error('[GTPArtizenDataAdapter] Could not load Artizen snapshot (HTTP ' + response.status + ')');
        return response.json();
      }),
      fetch(basePath + 'data/artizen-curation.json').then(function (response) {
        if (!response.ok) throw new Error('[GTPArtizenDataAdapter] Could not load creator-curated links (HTTP ' + response.status + ')');
        return response.json();
      })
    ]).then(function (payloads) {
      return transform(payloads[0], payloads[1]);
    });

    return {
      getProjects: function () { return dataPromise.then(function (data) { return data.projects; }); },
      getAssociations: function () { return dataPromise.then(function (data) { return data.associations; }); },
      getActivity: function () { return Promise.resolve([]); },
      getMetrics: function () { return dataPromise.then(function (data) { return data.metrics; }); }
    };
  }

  return { create: create, transform: transform };
}());

window.GTPArtizenDataAdapter = GTPArtizenDataAdapter;
