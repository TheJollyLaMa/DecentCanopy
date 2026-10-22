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
    'could-reuse': 'Could provide reusable patterns to',
    'capability-match': 'Candidate offer-to-need crossover',
    'foundational-offering': 'Foundational web3 architecture offered (adoption unverified)'
  };
  const FOCUS = { now: 'Now', next: 'Next', inventory: 'Inventory / not prioritized' };
  const CAPABILITY_STATES = {
    'code-observed': 'Implementation inspected; not integration-tested',
    documented: 'Documented design or example; readiness unverified',
    'issue-reported': 'Need expressed in an issue; resolution not verified'
  };
  const LENSES = ['all', 'offers', 'needs', 'crossovers'];
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

  function validateCapabilities(project, field) {
    if (project[field] === undefined) return;
    if (!Array.isArray(project[field])) throw new Error(`Agency ${field} must be an array.`);
    const ids = new Set();
    project[field].forEach(item => {
      if (!item || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id || '') ||
          ids.has(item.id) || !text(item.label) || !text(item.detail) ||
          !Object.hasOwn(CAPABILITY_STATES, item.state)) throw new Error(`Invalid agency ${field} entry.`);
      ids.add(item.id);
      validateEvidence(item.evidence);
      if (!item.evidence?.length) throw new Error(`Agency ${field} require public evidence.`);
    });
  }

  function lensIds(projects, associations, lens) {
    if (!LENSES.includes(lens)) throw new Error('Unsupported agency lens.');
    if (lens === 'all') return new Set(projects.map(project => project.id));
    if (lens === 'crossovers') return new Set(associations.filter(edge => edge.type === 'capability-match')
      .flatMap(edge => [edge.source, edge.target]));
    return new Set(projects.filter(project => project.kind !== 'repository' && project.agencyDetails?.[lens]?.length)
      .map(project => project.id));
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
      if (project.ens !== undefined && !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+eth$/.test(project.ens)) {
        throw new Error('Invalid agency ENS name.');
      }
      if (project.discordAvatar !== undefined &&
          !/^https:\/\/cdn\.discordapp\.com\/(?:avatars|guilds)\/[\w/.-]+\.(?:png|webp|gif)(?:\?size=\d+)?$/.test(project.discordAvatar)) {
        throw new Error('Invalid published Discord avatar.');
      }
      if (project.repo !== undefined && (!/^[a-z0-9][a-z0-9-]{0,38}\/[\w.-]+$/i.test(project.repo) ||
          ['.', '..'].includes(project.repo.split('/')[1]))) throw new Error('Invalid public repository identity.');
      if (project.tags !== undefined && (!Array.isArray(project.tags) || !project.tags.every(text))) throw new Error('Invalid agency tags.');
      validateCapabilities(project, 'offers');
      validateCapabilities(project, 'needs');
      if (project.reviewNote !== undefined && !text(project.reviewNote)) throw new Error('Invalid agency review note.');
      if (project.reviewCaveats !== undefined &&
          (!Array.isArray(project.reviewCaveats) || !project.reviewCaveats.every(text))) throw new Error('Invalid agency review caveats.');
      validateEvidence(project.evidence);
    });
    if (data.projects.filter(project => project.kind === 'initiative').length !== 1) {
      throw new Error('Agency map must declare one umbrella initiative.');
    }
    if (data.foundationalProvider !== undefined &&
        !data.projects.some(p => p.id === data.foundationalProvider && !p.external && p.kind !== 'initiative')) {
      throw new Error('Foundational provider must be an internal project.');
    }
    const matches = new Set();
    data.relationships.forEach(edge => {
      if (!edge || !ids.has(edge.source) || !ids.has(edge.target) || edge.source === edge.target ||
          !Object.hasOwn(TYPES, edge.type) || !Object.hasOwn(STATES, edge.state) || !text(edge.note)) {
        throw new Error('Agency relationship has an invalid endpoint, type, state, or note.');
      }
      validateEvidence(edge.evidence);
      if (edge.state === 'observed' && !edge.evidence?.length) throw new Error('Observed agency relationships require source evidence.');
      if (edge.type === 'capability-match') {
        const key = JSON.stringify([edge.source, edge.offer, edge.target, edge.need]);
        if (matches.has(key)) throw new Error('Duplicate agency capability match.');
        matches.add(key);
        const source = data.projects.find(project => project.id === edge.source);
        const target = data.projects.find(project => project.id === edge.target);
        if (edge.state !== 'proposed' || !source.offers?.some(item => item.id === edge.offer) ||
            !target.needs?.some(item => item.id === edge.need) || !text(edge.nextTest) || !edge.evidence?.length) {
          throw new Error('Candidate crossovers need a source offer, target need, public evidence, and next validation step.');
        }
      } else if (edge.offer !== undefined || edge.need !== undefined || edge.nextTest !== undefined) {
        throw new Error('Offer/need references belong only on capability matches.');
      }
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
        nextAction: details.nextAction, tags: [...(project.tags || []),
          ...[...(project.offers || []), ...(project.needs || [])].map(item => `${item.label} ${item.detail}`)],
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
      note: edge.note, evidence: edge.evidence || [], reviewedAt: data.reviewedAt,
      ...(edge.type === 'capability-match' ? {
        offer: edge.offer, need: edge.need, nextTest: edge.nextTest
      } : {})
    }));
    if (data.foundationalProvider) {
      const source = projectId(data.foundationalProvider);
      for (const project of data.projects) {
        const target = projectId(project.id);
        if (source === target || project.external || project.kind === 'initiative' ||
            associations.some(edge => edge.source === source && edge.target === target)) continue;
        associations.push({
          source, target, type: 'foundational-offering', relationshipState: 'reported',
          sourceLabel: 'Steward-declared ecosystem foundation',
          note: 'DecentHead offers foundational wallet, web3 and shared-session architecture to this project. This is availability of a foundation, not evidence of adoption, compatibility or a deployed integration. Preserve each project context and test before reuse.',
          evidence: [], reviewedAt: data.reviewedAt
        });
      }
    }
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

  const api = { create, transform, STATES, TYPES, FOCUS, CAPABILITY_STATES, LENSES, lensIds };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GTPAgencyDataAdapter = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
