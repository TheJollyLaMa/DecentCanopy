(function (root) {
  'use strict';

  const STATES = {
    observed: { label: 'Source-observed', color: '#60a5fa', dashed: false },
    reported: { label: 'Steward-reported', color: '#fbbf24', dashed: true },
    proposed: { label: 'Proposed only', color: '#c084fc', dashed: true },
    unresolved: { label: 'Unresolved', color: '#94a3b8', dashed: true }
  };
  const TYPES = {
    'under-umbrella': 'Under umbrella',
    'repository-link': 'Curated repository link',
    'grew-into': 'Grew into',
    'could-integrate': 'Could integrate with',
    'desired-foundation': 'Desired foundation for',
    'relationship-to-clarify': 'Relationship to clarify',
    supports: 'Supports',
    'provides-capability': 'Provides capability to',
    'could-reuse': 'Could provide reusable patterns to'
  };
  const FOCUS = { now: 'Now', next: 'Next', inventory: 'Inventory / not prioritized' };
  const projectId = id => `agency-project:${id}`;
  const repositoryId = repo => `github-repo:${repo.toLowerCase()}`;
  const text = value => typeof value === 'string' && value.trim().length > 0;

  function validateEvidence(evidence = []) {
    if (!Array.isArray(evidence)) throw new Error('Agency map evidence must be an array.');
    evidence.forEach(item => {
      if (!item || !text(item.label)) throw new Error('Agency map evidence needs a label.');
      const url = new URL(item.url);
      if (url.protocol !== 'https:' || url.username || url.password) {
        throw new Error('Agency map evidence must use public HTTPS links without credentials.');
      }
    });
  }

  function transform(data) {
    if (data?.format !== 'decentcanopy-agency-map' || data.version !== 1) {
      throw new Error('Unsupported agency map format or version.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.reviewedAt || '') ||
        new Date(`${data.reviewedAt}T00:00:00Z`).toISOString().slice(0, 10) !== data.reviewedAt ||
        !text(data.sourceLabel) || !text(data.mission)) {
      throw new Error('Agency map needs a valid review date, source label, and mission.');
    }
    if (!Array.isArray(data.projects) || !data.projects.length || !Array.isArray(data.relationships)) {
      throw new Error('Agency map needs projects and relationships.');
    }
    const ids = new Set();
    data.projects.forEach(project => {
      if (!project || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(project.id || '') ||
          ids.has(project.id) || !text(project.name)) {
        throw new Error('Agency map project IDs and names must be present and IDs unique.');
      }
      ids.add(project.id);
      for (const field of ['purpose', 'currentState', 'nextAction', 'repositoryNote']) {
        if (project[field] !== undefined && !text(project[field])) throw new Error(`Invalid agency project ${field}.`);
      }
      if (project.focus !== undefined && !Object.hasOwn(FOCUS, project.focus)) throw new Error('Invalid agency focus.');
      if (project.kind !== undefined && !['project', 'initiative'].includes(project.kind)) throw new Error('Invalid agency entity kind.');
      if (project.external !== undefined && typeof project.external !== 'boolean') throw new Error('Invalid external-project flag.');
      if (project.repo !== undefined && (!/^[a-z0-9][a-z0-9-]{0,38}\/[\w.-]+$/i.test(project.repo) ||
          ['.', '..'].includes(project.repo.split('/')[1]))) throw new Error('Invalid public repository identity.');
      if (project.tags !== undefined && (!Array.isArray(project.tags) || !project.tags.every(text))) throw new Error('Invalid agency tags.');
      validateEvidence(project.evidence);
    });
    if (data.projects.filter(project => project.kind === 'initiative').length !== 1) {
      throw new Error('Agency map must declare one umbrella initiative.');
    }
    data.relationships.forEach(edge => {
      if (!edge || !ids.has(edge.source) || !ids.has(edge.target) || edge.source === edge.target ||
          !Object.hasOwn(TYPES, edge.type) || !Object.hasOwn(STATES, edge.state) || !text(edge.note)) {
        throw new Error('Agency relationship has an invalid endpoint, type, state, or note.');
      }
      validateEvidence(edge.evidence);
      if (edge.state === 'observed' && !edge.evidence?.length) throw new Error('Observed agency relationships require source evidence.');
    });

    const projects = [];
    const associations = [];
    const repos = new Map();
    const umbrella = data.projects.find(project => project.kind === 'initiative');
    const common = {
      raised: null, goal: null, available: null, stewards: 0,
      sourceLabel: data.sourceLabel, generatedAt: data.reviewedAt, dataState: 'curated-planning'
    };
    data.projects.forEach(project => {
      const focus = project.focus || 'inventory';
      const details = {
        ...project,
        focus,
        reviewedAt: data.reviewedAt,
        currentState: project.currentState || 'Implementation, deployment, and reusable capabilities have not yet been reviewed.',
        nextAction: project.nextAction || 'Review purpose and current code, resolve the public repository link, and identify one evidence-backed next step.',
        repositoryNote: project.repositoryNote || (project.repo
          ? 'Public repository identity checked; association is curated, not GitHub identity or ownership verification.'
          : 'Public repository identity unresolved; no repository URL is published.'),
        evidence: project.evidence || []
      };
      projects.push({
        ...common, id: projectId(project.id), name: project.name,
        kind: project.kind || 'project', track: project.kind === 'initiative' ? 'Initiatives' : 'Projects',
        status: focus, description: project.purpose || 'Purpose and current implementation not yet reviewed.',
        nextAction: details.nextAction, tags: project.tags || [],
        repoUrl: project.repo ? `https://github.com/${project.repo}` : null,
        agencyDetails: details
      });
      if (project.id !== umbrella.id && !project.external) {
        associations.push({
          source: projectId(umbrella.id), target: projectId(project.id), type: 'under-umbrella',
          sourceLabel: 'Steward-curated umbrella association', relationshipState: 'reported',
          note: 'Included at the steward\'s request; not legal ownership, endorsement, or GitHub organization membership.',
          evidence: [], reviewedAt: data.reviewedAt
        });
      }
      if (project.repo) {
        const id = repositoryId(project.repo);
        if (!repos.has(id)) {
          const repo = {
            ...common, id, name: project.repo, kind: 'repository', track: 'Repositories',
            status: focus, description: 'Public repository linked by this curated planning map; source code and issue status are not synchronized live.',
            repoUrl: `https://github.com/${project.repo}`, tags: project.tags || [],
            agencyDetails: { ...details, name: project.repo, evidence: [
              { label: 'Public GitHub repository', url: `https://github.com/${project.repo}` },
              ...details.evidence
            ] }
          };
          repos.set(id, repo);
          projects.push(repo);
        } else {
          const repo = repos.get(id);
          if (['now', 'next', 'inventory'].indexOf(focus) < ['now', 'next', 'inventory'].indexOf(repo.status)) {
            repo.status = focus;
            repo.agencyDetails.focus = focus;
          }
        }
        associations.push({
          source: projectId(project.id), target: id, type: 'repository-link',
          sourceLabel: 'Curated project-to-repository association', relationshipState: 'reported',
          note: details.repositoryNote, evidence: [], reviewedAt: data.reviewedAt
        });
      }
    });
    data.relationships.forEach(edge => associations.push({
      source: projectId(edge.source), target: projectId(edge.target), type: edge.type,
      sourceLabel: STATES[edge.state].label, relationshipState: edge.state,
      note: edge.note, evidence: edge.evidence || [], reviewedAt: data.reviewedAt
    }));
    return {
      projects, associations, activity: [],
      metrics: {
        availableFunds: null, source: data.sourceLabel, generatedAt: data.reviewedAt,
        dataNotes: [
          data.mission,
          'Dated, curated planning snapshot, not live GitHub synchronization or account verification.',
          'Funding balances, reservations, payments, and deployments are not verified by this map.'
        ]
      }
    };
  }

  function create(options = {}) {
    let pending;
    function load() {
      if (!pending) pending = fetch(`${options.basePath || ''}data/agency-map.json`)
        .then(response => {
          if (!response.ok) throw new Error(`Agency map could not load (HTTP ${response.status}).`);
          return response.json();
        }).then(transform).catch(error => { pending = null; throw error; });
      return pending;
    }
    return {
      getProjects: () => load().then(graph => graph.projects),
      getAssociations: () => load().then(graph => graph.associations),
      getActivity: () => load().then(graph => graph.activity),
      getMetrics: () => load().then(graph => graph.metrics)
    };
  }

  const api = { create, transform, STATES, TYPES, FOCUS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GTPAgencyDataAdapter = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
