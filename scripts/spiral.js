/**
 * spiral.js — Branch Constellation Exploration View
 * DecentCanopy · v0.1  (extracted from TheJollyLaMa/TheGreenTeaParty v0.33)
 */

(function () {
  'use strict';

  // ---- Constants ----------------------------------------------------------------

  const TRACK_COLORS = {
    'Season 1 · Founding': '#22c55e',
    'Season 2 · Public Goods': '#3b82f6',
    'Season 3 · Art + Science': '#ef4444',
    'Season 4 · Community Systems': '#a855f7',
    'Season 5 · Creator Infrastructure': '#f59e0b',
    'Season 6 · Cultural Commons': '#94a3b8',
    Projects: '#34d399',
    Funds: '#a78bfa',
    Creators: '#fbbf24'
  };

  const TRACK_ORDER = Object.keys(TRACK_COLORS);

  const STATUS_COLORS = {
    curation: '#3b82f6',
    competition: '#f59e0b',
    funded: '#22c55e',
    archived: '#94a3b8',
    active: '#22c55e',
    planning: '#f59e0b',
    completed: '#94a3b8',
    paused: '#ef4444',
    'not-reported': '#64748b',
    'not-in-feed': '#f59e0b',
    curated: '#fbbf24',
    inactive: '#94a3b8'
  };

  const ASSOCIATION_PRIORITY = {
    'parent-child': 4,
    'shared-steward': 3,
    collaboration: 2,
    'funding-pool': 1.5,
    'research-link': 1,
    'same-track': 0.5,
    submitted: 3,
    curated: 4,
    funded: 5,
    'creator-associated': 5,
    'associated-project': 4,
    'fund-steward': 4,
    'fund-member': 3,
    boosted: 2,
    'collected-artifacts': 2
  };

  const MIN_ZOOM = 0.35;
  const MAX_ZOOM = 8;
  const FAR_LOD_ZOOM = 0.78;
  const NEAR_LOD_ZOOM = 1.8;
  const META_LOD_ZOOM = 2.65;
  const TRACK_RING_RADIUS = 270;
  const BASE_BRANCH_LENGTH = 92;
  const BRANCH_DECAY = 0.74;
  const BRANCH_SPREAD = Math.PI * 0.94;
  const VIEW_MARGIN = 120;
  const DRAG_THRESHOLD = 4;

  // ---- Application state --------------------------------------------------------

  let allProjects = [];
  let allAssociations = [];
  let allNeighborIds = {};
  let allEntitiesById = {};
  let isArtizenMode = false;
  let isGreenTeaMode = false;
  let fundCanopyId = null;
  let artizenMetrics = null;

  let nodes = [];
  let nodeMap = {};
  let adjacency = {};
  let relationTypes = {};
  let branchEdges = [];
  let relationEdges = [];
  let parentById = {};
  let childrenById = {};
  let subtreeSize = {};
  let descendantCache = {};
  let trackClusters = [];

  let pan = { x: 0, y: 0 };
  let zoom = 1;
  let homeCamera = { pan: { x: 0, y: 0 }, zoom: 1 };

  let pointerDown = false;
  let isPanning = false;
  let suppressClick = false;
  let panLast = { x: 0, y: 0 };
  let pointerStart = { x: 0, y: 0 };

  let hoveredNode = null;
  let selectedNode = null;
  let focusMode = false;
  let showAssoc = true;
  let focusHistory = [];

  let filterTrack = 'all';
  let filterStatus = 'all';
  let filterSearch = '';
  let searchTimeout = null;

  let rafId = null;
  let needRender = true;
  let dpr = 1;
  let cameraAnimation = null;
  let activityReplay = null;

  let touchPrev = null;
  let touchPinchDist = null;

  // ---- DOM references -----------------------------------------------------------

  let canvas;
  let ctx;
  let tooltipEl;
  let detailsPanel;
  let detailsContentEl;
  let assocBtn;
  let focusBtn;
  let resetBtn;
  let zoomInBtn;
  let zoomOutBtn;
  let backBtn;
  let closeDetailsBtn;
  let breadcrumbsEl;
  let trackSel;
  let statusSel;
  let searchInput;
  let modeBadgeEl;
  let visionNoteEl;
  let loadingEl;
  let emptyEl;

  // ---- Initialisation -----------------------------------------------------------

  async function init() {
    canvas = document.getElementById('spiral-canvas');
    ctx = canvas.getContext('2d');
    tooltipEl = document.getElementById('spiral-tooltip');
    detailsPanel = document.getElementById('details-panel');
    detailsContentEl = document.getElementById('details-content');
    assocBtn = document.getElementById('toggle-assoc');
    focusBtn = document.getElementById('toggle-focus');
    resetBtn = document.getElementById('reset-view');
    zoomInBtn = document.getElementById('zoom-in');
    zoomOutBtn = document.getElementById('zoom-out');
    backBtn = document.getElementById('focus-back');
    closeDetailsBtn = document.getElementById('close-details');
    breadcrumbsEl = document.getElementById('spiral-breadcrumbs');
    trackSel = document.getElementById('spiral-track-filter');
    statusSel = document.getElementById('spiral-status-filter');
    searchInput = document.getElementById('spiral-search');
    modeBadgeEl = document.querySelector('.mode-badge');
    visionNoteEl = document.querySelector('.prototype-vision-note');
    const canopy = new URLSearchParams(window.location.search).get('canopy');
    isGreenTeaMode = canopy === 'green-tea';
    isArtizenMode = canopy === 'artizen' || isGreenTeaMode ||
      (!canopy && GTPModeRouter.getModeInfo(window.location).mode === 'prototype');
    loadingEl = document.getElementById('spiral-loading');
    emptyEl = document.getElementById('spiral-empty');

    setupCanvas();
    bindEvents();

    try {
      // Use the shared data layer when available, otherwise fall back to own fetch.
      if (typeof GTPData !== 'undefined') {
        await GTPData.load();
        allProjects = GTPData.getProjects();
        allAssociations = GTPData.getAssociations();
        artizenMetrics = GTPData.getAdapterMetrics();
      } else {
        const [pRes, aRes] = await Promise.all([
          fetch('data/projects.json'),
          fetch('data/associations.json')
        ]);
        if (!pRes.ok || !aRes.ok) throw new Error('Fetch failed');
        allProjects = await pRes.json();
        allAssociations = await aRes.json();
      }

      if (isGreenTeaMode) filterToGreenTeaCluster();

    } catch (err) {
      console.error('[spiral] Failed to load data:', err);
      if (loadingEl) loadingEl.style.display = 'none';
      if (emptyEl) {
        emptyEl.querySelector('strong').textContent = 'Could not load project data.';
        emptyEl.querySelector('p').textContent = isArtizenMode
          ? 'Check that data/artizen.json and data/artizen-curation.json exist, then run node scripts/sync-artizen-data.js to refresh the public snapshot.'
          : 'Check that data/projects.json and data/associations.json exist.';
        emptyEl.style.display = 'block';
      }
      return;
    }

    if (loadingEl) loadingEl.style.display = 'none';

    buildGlobalNeighbors();
    updateCanopyDescription();
    populateFilters();
    buildLayout();
    applyHomeCamera(false);
    updateBreadcrumbs();
    updateBackButton();
    scheduleRender();
    window.dispatchEvent(new CustomEvent('decentcanopy:ready', { detail: { artizen: isArtizenMode, greenTea: isGreenTeaMode } }));
  }

  function filterToGreenTeaCluster() {
    const root = allProjects.find((project) => project.slug === 'green-tea-party');
    if (!root) throw new Error('The Artizen snapshot does not contain the Green Tea Party project.');

    const associations = allAssociations.filter((edge) =>
      edge.type === 'associated-project' && (edge.source === root.id || edge.target === root.id)
    );
    const projectIds = new Set([root.id]);
    associations.forEach((edge) => {
      const candidateId = edge.source === root.id ? edge.target : edge.source;
      const candidate = allProjects.find((project) => project.id === candidateId);
      if (candidate?.kind === 'project') projectIds.add(candidateId);
    });
    allProjects = allProjects.filter((project) => projectIds.has(project.id));
    allAssociations = associations.filter((edge) => projectIds.has(edge.source) && projectIds.has(edge.target));
  }

  function buildGlobalNeighbors() {
    allNeighborIds = {};
    allEntitiesById = {};
    allProjects.forEach((project) => {
      allNeighborIds[project.id] = new Set();
      allEntitiesById[project.id] = project;
    });
    allAssociations.forEach((edge) => {
      if (!allNeighborIds[edge.source] || !allNeighborIds[edge.target]) return;
      allNeighborIds[edge.source].add(edge.target);
      allNeighborIds[edge.target].add(edge.source);
    });
  }

  // ---- Canvas setup -------------------------------------------------------------

  function setupCanvas() {
    resizeCanvas();
    window.addEventListener('resize', () => {
      resizeCanvas();
      homeCamera = computeHomeCamera();
      scheduleRender();
    });
  }

  function resizeCanvas() {
    dpr = window.devicePixelRatio || 1;
    const wrap = canvas.parentElement;
    const w = wrap.clientWidth || window.innerWidth;
    const h = wrap.clientHeight || window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    needRender = true;
  }

  function cw() {
    return canvas.width / dpr;
  }

  function ch() {
    return canvas.height / dpr;
  }

  // ---- Layout -------------------------------------------------------------------

  function buildLayout() {
    const filtered = filteredProjects();

    if (filtered.length === 0) {
      nodes = [];
      nodeMap = {};
      adjacency = {};
      relationTypes = {};
      branchEdges = [];
      relationEdges = [];
      parentById = {};
      childrenById = {};
      subtreeSize = {};
      descendantCache = {};
      trackClusters = [];
      if (selectedNode) closeDetails({ clearSelection: true });
      if (emptyEl) {
        if (isArtizenMode) {
          emptyEl.querySelector('strong').textContent = 'No entities match this search or view.';
          emptyEl.querySelector('p').textContent = 'Try a different name, tag, or entity type.';
        }
        emptyEl.style.display = 'block';
      }
      needRender = true;
      updateBreadcrumbs();
      updateBackButton();
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    const sorted = [...filtered].sort((a, b) => {
      const ai = TRACK_ORDER.indexOf(a.track);
      const bi = TRACK_ORDER.indexOf(b.track);
      return ai !== bi ? ai - bi : a.id.localeCompare(b.id);
    });

    nodes = sorted.map((project) => {
      const progress = project.goal > 0 ? project.raised / project.goal : 0;
      const size = 6 + Math.min(progress, 1) * 7;
      return {
        ...project,
        x: 0,
        y: 0,
        size: project.kind === 'creator' ? 12 : project.kind === 'fund' ? 8.5 : size,
        degree: 0,
        depth: 0,
        trackIndex: TRACK_ORDER.indexOf(project.track),
        screenX: 0,
        screenY: 0
      };
    });

    nodeMap = {};
    nodes.forEach((node) => {
      nodeMap[node.id] = node;
    });

    adjacency = {};
    childrenById = {};
    relationTypes = {};
    nodes.forEach((node) => {
      adjacency[node.id] = new Set();
      childrenById[node.id] = [];
    });

    const visibleIds = new Set(nodes.map((node) => node.id));
    relationEdges = allAssociations
      .filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target))
      .map((edge) => {
        adjacency[edge.source].add(edge.target);
        adjacency[edge.target].add(edge.source);
        relationTypes[relationKey(edge.source, edge.target)] = edge.type;
        return {
          source: nodeMap[edge.source],
          target: nodeMap[edge.target],
          type: edge.type,
          priority: associationPriority(edge.type),
          sourceLabel: edge.sourceLabel
        };
      });

    nodes.forEach((node) => {
      node.degree = isArtizenMode ? (allNeighborIds[node.id]?.size || 0) : adjacency[node.id].size;
      if (isArtizenMode) {
        const baseSize = node.kind === 'creator' ? 11 : node.kind === 'fund' ? 6 : 4.5;
        node.size = Math.min(baseSize + Math.sqrt(node.degree) * 0.8, node.kind === 'creator' ? 13 : 10.5);
      }
    });

    parentById = {};
    subtreeSize = {};
    descendantCache = {};
    trackClusters = [];

    const groups = TRACK_ORDER
      .map((track) => nodes.filter((node) => node.track === track))
      .filter((group) => group.length > 0);

    if (fundCanopyId) {
      layoutFundCanopy();
    } else if (isArtizenMode) {
      layoutArtizenGroups(groups);
    } else {
      groups.forEach((group, index) => buildTrackHierarchy(group, index, groups.length));
      groups.forEach((group) => {
        const rootId = trackClusters.find((cluster) => cluster.track === group[0].track)?.rootId;
        if (rootId) {
          computeSubtreeSize(rootId);
          buildDescendantCache(rootId);
        }
      });

      trackClusters.forEach((cluster, index) => {
        const root = nodeMap[cluster.rootId];
        if (!root) return;
        const angle = groups.length === 1 ? -Math.PI / 2 : -Math.PI / 2 + (Math.PI * 2 * index) / groups.length;
        const hubRadius = groups.length === 1 ? 0 : TRACK_RING_RADIUS;
        const hubX = Math.cos(angle) * hubRadius;
        const hubY = Math.sin(angle) * hubRadius;
        cluster.x = hubX;
        cluster.y = hubY;
        placeBranch(root.id, hubX, hubY, angle, BRANCH_SPREAD, 0);
      });
    }

    branchEdges = isArtizenMode ? [] : Object.entries(parentById)
      .filter(([, parentId]) => Boolean(parentId))
      .map(([childId, parentId]) => ({
        parent: nodeMap[parentId],
        child: nodeMap[childId]
      }))
      .filter((edge) => edge.parent && edge.child);

    homeCamera = computeHomeCamera();

    if (selectedNode && nodeMap[selectedNode.id]) {
      selectedNode = nodeMap[selectedNode.id];
      if (focusMode) showDetails(selectedNode);
    } else if (selectedNode) {
      closeDetails({ clearSelection: true });
      focusHistory = [];
    }

    updateBreadcrumbs();
    updateBackButton();
    needRender = true;
  }

  function layoutFundCanopy() {
    const selectedFund = nodeMap[fundCanopyId];
    if (!selectedFund) return;

    const directProjectIds = new Set(
      allAssociations.flatMap((edge) => {
        if (edge.source === fundCanopyId && nodeMap[edge.target]?.kind === 'project') return [edge.target];
        if (edge.target === fundCanopyId && nodeMap[edge.source]?.kind === 'project') return [edge.source];
        return [];
      })
    );
    const projects = nodes.filter((node) => node.kind === 'project');
    const primaryProjects = projects.filter((node) => directProjectIds.has(node.id));
    const otherProjects = projects.filter((node) => !directProjectIds.has(node.id));
    const orbitRadius = Math.max(210, 90 + Math.sqrt(primaryProjects.length) * 42);

    selectedFund.x = 0;
    selectedFund.y = 0;
    selectedFund.depth = 0;
    parentById[selectedFund.id] = null;

    primaryProjects.forEach((node, index) => {
      const angle = index * 2.399963229728653 + stableUnit(node.id) * 0.08;
      const radius = 105 + Math.sqrt(index) * Math.min(29, orbitRadius / 12);
      node.x = Math.cos(angle) * radius;
      node.y = Math.sin(angle) * radius;
      node.depth = 1;
      parentById[node.id] = selectedFund.id;
    });

    otherProjects.forEach((node, index) => {
      const angle = index * 2.399963229728653 + stableUnit(node.id) * 0.08;
      const radius = orbitRadius + Math.sqrt(index) * 25;
      node.x = Math.cos(angle) * radius;
      node.y = Math.sin(angle) * radius;
      node.depth = 2;
      parentById[node.id] = null;
    });

    const outerEntities = nodes.filter((node) =>
      (node.kind === 'fund' && node.id !== fundCanopyId) || node.kind === 'creator'
    );
    outerEntities.forEach((node, index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(outerEntities.length, 1);
      const radius = orbitRadius + Math.max(110, Math.sqrt(otherProjects.length) * 24);
      node.x = Math.cos(angle) * radius;
      node.y = Math.sin(angle) * radius;
      node.depth = 2;
      parentById[node.id] = null;
    });

    trackClusters = [{
      track: 'Fund canopy',
      rootId: selectedFund.id,
      count: nodes.length,
      index: 0,
      total: 1,
      x: 0,
      y: 0
    }];
    nodes.forEach((node) => {
      subtreeSize[node.id] = 1;
      descendantCache[node.id] = new Set();
    });
    primaryProjects.forEach((node) => {
      childrenById[selectedFund.id]?.push(node.id);
      descendantCache[selectedFund.id]?.add(node.id);
    });
  }

  function layoutArtizenGroups(groups) {
    const settings = isGreenTeaMode ? {
      Projects: { x: 0, y: 0, spacing: 115 }
    } : {
      Projects: { x: -300, y: 30, spacing: 10.2 },
      Funds: { x: 390, y: 30, spacing: 10.4 },
      Creators: { x: 40, y: 720, spacing: 18 }
    };

    groups.forEach((group, index) => {
      group.sort(compareNodePriority);
      const track = group[0].track;
      const center = settings[track] || { x: 0, y: 0, spacing: 10 };
      const root = group[0];
      trackClusters.push({
        track: track,
        rootId: root.id,
        count: group.length,
        index: index,
        total: groups.length,
        x: center.x,
        y: center.y
      });
      group.forEach((node, nodeIndex) => {
        const angle = nodeIndex * 2.399963229728653 + stableUnit(node.id) * 0.1;
        const radius = center.spacing * Math.sqrt(nodeIndex);
        node.x = center.x + Math.cos(angle) * radius;
        node.y = center.y + Math.sin(angle) * radius;
        node.depth = 0;
        parentById[node.id] = null;
      });
    });
  }

  function buildTrackHierarchy(group, groupIndex, groupCount) {
    const root = chooseTrackRoot(group);
    const assigned = new Set([root.id]);
    const queue = [root.id];
    parentById[root.id] = null;

    while (queue.length) {
      const currentId = queue.shift();
      const childIds = sortedTrackNeighbours(currentId)
        .filter((id) => nodeMap[id]?.track === root.track)
        .filter((id) => !assigned.has(id));

      childIds.forEach((childId) => {
        assigned.add(childId);
        parentById[childId] = currentId;
        childrenById[currentId].push(childId);
        queue.push(childId);
      });
    }

    group
      .filter((node) => !assigned.has(node.id))
      .sort(compareNodePriority)
      .forEach((node) => {
        const parentId = findFallbackParent(node, group, assigned, root.id);
        assigned.add(node.id);
        parentById[node.id] = parentId;
        childrenById[parentId].push(node.id);
      });

    sortChildren(root.id);

    trackClusters.push({
      track: root.track,
      rootId: root.id,
      count: group.length,
      index: groupIndex,
      total: groupCount,
      x: 0,
      y: 0
    });
  }

  function chooseTrackRoot(group) {
    return [...group].sort(compareNodePriority)[0];
  }

  function compareNodePriority(a, b) {
    const degreeDiff = b.degree - a.degree;
    if (degreeDiff) return degreeDiff;
    const stewardDiff = (b.stewards || 0) - (a.stewards || 0);
    if (stewardDiff) return stewardDiff;
    const fundedDiff = (b.raised || 0) - (a.raised || 0);
    if (fundedDiff) return fundedDiff;
    return a.id.localeCompare(b.id);
  }

  function sortedTrackNeighbours(nodeId) {
    const source = nodeMap[nodeId];
    if (!source) return [];
    return [...(adjacency[nodeId] || [])].sort((aId, bId) => {
      const a = nodeMap[aId];
      const b = nodeMap[bId];
      const aTrackBonus = a?.track === source.track ? 1 : 0;
      const bTrackBonus = b?.track === source.track ? 1 : 0;
      if (bTrackBonus !== aTrackBonus) return bTrackBonus - aTrackBonus;
      const pa = associationPriority(relationTypes[relationKey(nodeId, aId)]);
      const pb = associationPriority(relationTypes[relationKey(nodeId, bId)]);
      if (pb !== pa) return pb - pa;
      const degreeDiff = (nodeMap[bId]?.degree || 0) - (nodeMap[aId]?.degree || 0);
      if (degreeDiff) return degreeDiff;
      return aId.localeCompare(bId);
    });
  }

  function findFallbackParent(node, group, assigned, rootId) {
    const sameTrackAssigned = group.filter((candidate) => assigned.has(candidate.id));
    const associated = sortedTrackNeighbours(node.id).find((candidateId) => assigned.has(candidateId));
    if (associated) return associated;
    const byIndex = [...sameTrackAssigned].sort((a, b) => {
      const ai = Math.abs(a.id.localeCompare(node.id));
      const bi = Math.abs(b.id.localeCompare(node.id));
      return ai - bi || compareNodePriority(a, b);
    })[0];
    return byIndex ? byIndex.id : rootId;
  }

  function sortChildren(nodeId) {
    const children = childrenById[nodeId] || [];
    children.sort((aId, bId) => {
      const ap = associationPriority(relationTypes[relationKey(nodeId, aId)] || 'same-track');
      const bp = associationPriority(relationTypes[relationKey(nodeId, bId)] || 'same-track');
      if (bp !== ap) return bp - ap;
      return compareNodePriority(nodeMap[aId], nodeMap[bId]);
    });
    children.forEach(sortChildren);
  }

  function computeSubtreeSize(nodeId) {
    const children = childrenById[nodeId] || [];
    const total = 1 + children.reduce((sum, childId) => sum + computeSubtreeSize(childId), 0);
    subtreeSize[nodeId] = total;
    return total;
  }

  function buildDescendantCache(nodeId) {
    const children = childrenById[nodeId] || [];
    const ids = [];
    children.forEach((childId) => {
      ids.push(childId);
      buildDescendantCache(childId);
      ids.push(...(descendantCache[childId] || []));
    });
    descendantCache[nodeId] = ids;
  }

  function placeBranch(nodeId, x, y, angle, spread, depth) {
    const node = nodeMap[nodeId];
    if (!node) return;

    node.x = x;
    node.y = y;
    node.depth = depth;

    const children = childrenById[nodeId] || [];
    if (!children.length) return;

    const offsets = angleOffsets(children.length, depth === 0 ? spread * 0.54 : spread * 0.7);
    const baseLength = BASE_BRANCH_LENGTH * Math.pow(BRANCH_DECAY, depth);

    children.forEach((childId, index) => {
      const child = nodeMap[childId];
      if (!child) return;
      const bias = (stableUnit(childId) - 0.5) * 0.2;
      const childAngle = angle + offsets[index] + bias;
      const weightBoost = 1 + Math.min((subtreeSize[childId] || 1) * 0.035, 0.34);
      const length = baseLength * weightBoost;
      const childX = x + Math.cos(childAngle) * length;
      const childY = y + Math.sin(childAngle) * length;
      placeBranch(childId, childX, childY, childAngle, Math.max(0.34, spread * 0.7), depth + 1);
    });
  }

  function angleOffsets(count, spread) {
    if (count === 1) return [0];
    const offsets = [];
    const step = spread / Math.max(1, count - 1);
    for (let i = 0; i < count; i += 1) {
      offsets.push(-spread / 2 + step * i);
    }
    return offsets;
  }

  function filteredProjects() {
    const search = filterSearch.trim().toLowerCase();
    const fundCanopyIds = fundCanopyId ? fundCanopyEntityIds(fundCanopyId) : null;
    let creatorContext = null;
    if (filterTrack === 'creator') {
      creatorContext = new Set();
      const creators = allProjects.filter((project) => project.kind === 'creator');
      creators.forEach((creator) => {
        creatorContext.add(creator.id);
        const directIds = allAssociations
          .filter((edge) => edge.source === creator.id || edge.target === creator.id)
          .map((edge) => edge.source === creator.id ? edge.target : edge.source);
        directIds.forEach((id) => {
          creatorContext.add(id);
          allAssociations.forEach((edge) => {
            if (edge.source === id) creatorContext.add(edge.target);
            else if (edge.target === id) creatorContext.add(edge.source);
          });
        });
      });
    }

    const matchingProjects = allProjects.filter((project) => {
      if (fundCanopyIds && !fundCanopyIds.has(project.id)) return false;
      const okTrack = filterTrack === 'all'
        || project.kind === filterTrack
        || (filterTrack === 'creator' && creatorContext.has(project.id));
      const okStatus = filterStatus === 'all' || project.status === filterStatus;
      const haystack = [project.name, project.description, project.creator]
        .concat(project.tags || [], project.facets || [])
        .join(' ')
        .toLowerCase();
      return okTrack && okStatus && (!search || haystack.includes(search));
    });

    if (!isArtizenMode || !search) return matchingProjects;
    const matchingIds = new Set(matchingProjects.map((project) => project.id));
    const visibleIds = new Set(matchingIds);
    allAssociations.forEach((edge) => {
      if (matchingIds.has(edge.source)) visibleIds.add(edge.target);
      if (matchingIds.has(edge.target)) visibleIds.add(edge.source);
    });
    return allProjects.filter((project) =>
      visibleIds.has(project.id) && (!fundCanopyIds || fundCanopyIds.has(project.id))
    );
  }

  function fundCanopyEntityIds(fundId) {
    const directProjectIds = new Set(
      allAssociations.flatMap((edge) => {
        if (edge.source === fundId && allEntitiesById[edge.target]?.kind === 'project') return [edge.target];
        if (edge.target === fundId && allEntitiesById[edge.source]?.kind === 'project') return [edge.source];
        return [];
      })
    );
    const ids = new Set([fundId, ...directProjectIds]);
    directProjectIds.forEach((projectId) => {
      allAssociations.forEach((edge) => {
        if (edge.source !== projectId && edge.target !== projectId) return;
        const relatedId = edge.source === projectId ? edge.target : edge.source;
        if (allEntitiesById[relatedId]) ids.add(relatedId);
      });
    });
    return ids;
  }

  // ---- Render loop --------------------------------------------------------------

  function scheduleRender() {
    needRender = true;
    if (!rafId) rafId = requestAnimationFrame(onAnimFrame);
  }

  function onAnimFrame(now) {
    rafId = null;
    const animating = stepCameraAnimation(now);
    const replaying = activityReplay && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      && now - activityReplay.startedAt < activityReplay.duration + 1800;
    if (activityReplay && !replaying) activityReplay = null;
    if (needRender || animating || replaying) {
      render();
      needRender = false;
    }
    if (animating || needRender || replaying) {
      rafId = requestAnimationFrame(onAnimFrame);
    }
  }

  function render() {
    const W = cw();
    const H = ch();
    const lod = currentLod();
    const world = worldBounds(VIEW_MARGIN / zoom);
    const focusContext = focusContextIds();

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);
    drawStarField(W, H);

    if (!nodes.length) return;

    ctx.save();
    ctx.translate(W / 2 + pan.x, H / 2 + pan.y);
    ctx.scale(zoom, zoom);

    drawTrackHubs(lod, focusContext, world);
    drawBranchEdges(lod, focusContext, world);
    if (showAssoc && lod !== 'far') drawAssociationEdges(focusContext, world);
    drawNodes(lod, focusContext, world);
    drawActivityReplay();

    ctx.restore();
  }

  function currentLod() {
    if (zoom < FAR_LOD_ZOOM) return 'far';
    if (zoom < NEAR_LOD_ZOOM) return 'mid';
    return 'near';
  }

  function drawActivityReplay() {
    if (!activityReplay) return;
    const elapsed = performance.now() - activityReplay.startedAt;
    ctx.save();
    activityReplay.events.forEach((event, index) => {
      const progress = (elapsed - index * activityReplay.interval) / 1800;
      if (progress < 0 || progress > 1) return;
      const target = nodeMap[event.target];
      if (!target) return;
      const color = event.type === 'purchase' ? '#fbbf24' : '#6ee7b7';
      const strength = event.type === 'purchase'
        ? 1.5 + Math.min(3, Math.log10(1 + event.amount)) : 0.8;
      ctx.beginPath();
      ctx.arc(target.x, target.y, target.size + (8 + progress * 25) * strength / zoom, 0, Math.PI * 2);
      ctx.strokeStyle = hexAlpha(color, (1 - progress) * 0.85);
      ctx.lineWidth = strength * 2 / zoom;
      ctx.stroke();
      const source = event.actor && nodeMap[event.actor];
      if (source) {
        ctx.setLineDash([4 / zoom, 4 / zoom]);
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.strokeStyle = hexAlpha(color, (1 - progress) * 0.3);
        ctx.lineWidth = 1 / zoom;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(lerp(source.x, target.x, progress), lerp(source.y, target.y, progress), 4 / zoom, 0, Math.PI * 2);
        ctx.fillStyle = hexAlpha(color, 1 - progress);
        ctx.fill();
      }
    });
    ctx.restore();
  }

  // ---- Star field ---------------------------------------------------------------

  const STARS = (function () {
    const stars = [];
    let seed = 0x9e3779b9;
    function rand() {
      seed = (seed * 1664525 + 1013904223) & 0xffffffff;
      return (seed >>> 0) / 0x100000000;
    }
    for (let i = 0; i < 180; i += 1) {
      stars.push({ x: rand(), y: rand(), r: rand() * 1.2 + 0.3, a: rand() * 0.35 + 0.15 });
    }
    return stars;
  }());

  function drawStarField(W, H) {
    ctx.save();
    STARS.forEach((star) => {
      ctx.beginPath();
      ctx.arc(star.x * W, star.y * H, star.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(226,232,240,${star.a})`;
      ctx.fill();
    });
    ctx.restore();
  }

  // ---- Edges --------------------------------------------------------------------

  function drawTrackHubs(lod, focusContext, world) {
    ctx.save();
    trackClusters.forEach((cluster) => {
      if (!pointInBounds(cluster.x, cluster.y, world, 90 / zoom)) return;
      const root = nodeMap[cluster.rootId];
      const selectedTrack = selectedNode?.track;
      const isDimmed = focusContext && selectedTrack && cluster.track !== selectedTrack;
      const alpha = isDimmed ? 0.16 : lod === 'far' ? 0.6 : 0.3;
      const color = TRACK_COLORS[cluster.track] || '#94a3b8';
      const radius = lod === 'far' ? 24 : 16;

      ctx.beginPath();
      ctx.arc(cluster.x, cluster.y, radius / zoom, 0, Math.PI * 2);
      ctx.fillStyle = hexAlpha(color, alpha * 0.35);
      ctx.fill();
      ctx.strokeStyle = hexAlpha(color, alpha);
      ctx.lineWidth = (lod === 'far' ? 2.5 : 1.4) / zoom;
      ctx.stroke();

      if (lod === 'far') {
        ctx.fillStyle = hexAlpha('#e5e7eb', isDimmed ? 0.4 : 0.82);
        ctx.font = `${Math.max(9, 12 / zoom)}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(cluster.track, cluster.x, cluster.y - 11 / zoom);
        ctx.fillStyle = hexAlpha('#cbd5e1', isDimmed ? 0.3 : 0.65);
        ctx.font = `${Math.max(8, 10 / zoom)}px Inter, system-ui, sans-serif`;
        ctx.textBaseline = 'top';
        ctx.fillText(`${cluster.count} ${isArtizenMode ? 'entities' : 'projects'}`, cluster.x, cluster.y + 9 / zoom);
      } else if (root && root.depth === 0) {
        ctx.fillStyle = hexAlpha(color, isDimmed ? 0.25 : 0.45);
        ctx.font = `${Math.max(8, 10 / zoom)}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(cluster.track, cluster.x, cluster.y - 16 / zoom);
      }
    });
    ctx.restore();
  }

  function drawBranchEdges(lod, focusContext, world) {
    ctx.save();
    branchEdges.forEach(({ parent, child }) => {
      if (!edgeVisible(parent, child, world)) return;
      const isContext = !focusContext || focusContext.has(parent.id) || focusContext.has(child.id);
      if (!isContext && focusMode) return;

      const color = TRACK_COLORS[parent.track] || '#94a3b8';
      const alpha = focusContext && !isContext ? 0.06 : lod === 'far' ? 0.42 : 0.28;
      const bend = 0.18 + (stableUnit(`${parent.id}:${child.id}`) * 0.18);
      const mx = (parent.x + child.x) / 2;
      const my = (parent.y + child.y) / 2;
      const dx = child.x - parent.x;
      const dy = child.y - parent.y;

      ctx.beginPath();
      ctx.moveTo(parent.x, parent.y);
      ctx.quadraticCurveTo(mx - dy * bend, my + dx * bend, child.x, child.y);
      ctx.strokeStyle = hexAlpha(color, alpha);
      ctx.lineWidth = (lod === 'far' ? 2.2 : 1.8) / zoom;
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawAssociationEdges(focusContext, world) {
    if (isArtizenMode && !selectedNode && zoom < 0.55) return;
    ctx.save();
    relationEdges.forEach(({ source, target, type, priority, sourceLabel }) => {
      if (!edgeVisible(source, target, world)) return;
      const touchesSelection = selectedNode && (source.id === selectedNode.id || target.id === selectedNode.id);
      const inFocusContext = !focusContext || focusContext.has(source.id) || focusContext.has(target.id);
      if (focusMode && !touchesSelection && !inFocusContext) return;

      const sameTrack = source.track === target.track;
      const isCurated = Boolean(sourceLabel && /curated|participant-reported|participant-declared/i.test(sourceLabel));
      const color = isCurated ? '#fbbf24' : sameTrack ? (TRACK_COLORS[source.track] || '#94a3b8') : '#94a3b8';
      const alpha = touchesSelection ? 0.5 : focusMode ? 0.07 : 0.13;
      const bend = 0.08 + priority * 0.03;
      const mx = (source.x + target.x) / 2;
      const my = (source.y + target.y) / 2;
      const dx = target.x - source.x;
      const dy = target.y - source.y;

      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.quadraticCurveTo(mx - dy * bend, my + dx * bend, target.x, target.y);
      ctx.strokeStyle = hexAlpha(color, alpha);
      ctx.lineWidth = (touchesSelection ? 1.2 : 0.75) / zoom;
      ctx.setLineDash(type === 'research-link' || isCurated ? [4 / zoom, 5 / zoom] : []);
      ctx.stroke();
    });
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ---- Nodes --------------------------------------------------------------------

  function drawNodes(lod, focusContext, world) {
    const labels = [];
    const visibleNodes = nodes
      .filter((node) => pointInBounds(node.x, node.y, world, node.size + 18 / zoom))
      .filter((node) => isArtizenMode || lod !== 'far' || node.depth <= 1 || hoveredNode?.id === node.id || selectedNode?.id === node.id)
      .sort((a, b) => a.depth - b.depth || a.size - b.size);

    visibleNodes.forEach((node) => {
      const isHovered = hoveredNode?.id === node.id;
      const isSelected = selectedNode?.id === node.id;
      const isContext = !focusContext || focusContext.has(node.id);
      const isDimmed = focusMode && !isContext && !isSelected;
      const color = TRACK_COLORS[node.track] || '#94a3b8';
      const alpha = isDimmed ? 0.16 : 1;
      const lodScale = lod === 'far' ? 0.9 : 1;
      const visSize = (isHovered || isSelected ? node.size * 1.28 : node.size) * lodScale;

      if ((isHovered || isSelected) && !isDimmed) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, visSize * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = hexAlpha(color, 0.08);
        ctx.fill();
      }

      const haloRaised = node.funding ? node.funding.raised : node.publicStats ? node.publicStats.total : null;
      if (isArtizenMode && haloRaised != null && !isDimmed) {
        const intensity = Math.min(1, Math.log10(1 + haloRaised) / 6);
        ctx.beginPath();
        ctx.arc(node.x, node.y, visSize * (1.4 + intensity), 0, Math.PI * 2);
        ctx.fillStyle = hexAlpha(color, 0.025 + intensity * 0.14);
        ctx.fill();
      }

      ctx.beginPath();
      traceNodeShape(node, visSize);
      ctx.fillStyle = hexAlpha(color, alpha * (lod === 'far' ? 0.55 : 0.74));
      ctx.fill();
      ctx.strokeStyle = hexAlpha(color, alpha);
      ctx.lineWidth = (isSelected ? 2.2 : node.depth === 0 ? 1.6 : 1) / zoom;
      ctx.stroke();

      if ((!isArtizenMode || node.funding) && lod !== 'far' && node.goal > 0 && alpha > 0.25) {
        const progress = Math.min(node.raised / node.goal, 1);
        if (progress > 0) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, visSize + 3.5 / zoom, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
          ctx.strokeStyle = hexAlpha(color, alpha * 0.48);
          ctx.lineWidth = 2 / zoom;
          ctx.stroke();
        }
      }

      if (!isArtizenMode && lod !== 'far') {
        const sdot = STATUS_COLORS[node.status] || '#94a3b8';
        ctx.beginPath();
        ctx.arc(node.x + visSize * 0.64, node.y - visSize * 0.64, Math.max(1.8, 2.8 / zoom), 0, Math.PI * 2);
        ctx.fillStyle = hexAlpha(sdot, alpha);
        ctx.fill();
      }

      if (shouldDrawLabel(node, lod, isHovered, isSelected, isDimmed)) {
        drawNodeLabel(node, visSize, lod, alpha, labels);
      }
    });
  }

  function traceNodeShape(node, radius) {
    if (node.kind !== 'fund' && node.kind !== 'creator') {
      if (isArtizenMode) {
        ctx.moveTo(node.x - radius * 0.18, node.y + radius);
        ctx.lineTo(node.x - radius * 0.18, node.y + radius * 0.34);
        ctx.lineTo(node.x - radius * 0.45, node.y + radius * 0.34);
        ctx.lineTo(node.x, node.y - radius);
        ctx.lineTo(node.x + radius * 0.45, node.y + radius * 0.34);
        ctx.lineTo(node.x + radius * 0.18, node.y + radius * 0.34);
        ctx.lineTo(node.x + radius * 0.18, node.y + radius);
        ctx.closePath();
        return;
      }
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      return;
    }
    const sides = node.kind === 'creator' ? 6 : 4;
    const rotation = node.kind === 'fund' ? Math.PI / 4 : 0;
    for (let i = 0; i < sides; i += 1) {
      const angle = rotation + (Math.PI * 2 * i) / sides;
      const x = node.x + Math.cos(angle) * radius;
      const y = node.y + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function shouldDrawLabel(node, lod, isHovered, isSelected, isDimmed) {
    if (isDimmed) return false;
    if (isHovered || isSelected) return true;
    if (lod === 'far') return false;
    if (lod === 'mid') return node.depth <= 1 || node.degree >= 4;
    return node.depth <= 2 || node.degree >= 3 || node.size >= 10;
  }

  function drawNodeLabel(node, visSize, lod, alpha, labels) {
    const nameSize = Math.max(9, 11 / zoom);
    const metaSize = Math.max(8, 9 / zoom);
    const screen = worldToScreen(node.x, node.y);
    const lines = [node.name];

    if (isArtizenMode && lod !== 'far' && zoom >= META_LOD_ZOOM) {
      lines.push(`${capitalize(node.kind)} · ${node.degree} connection${node.degree === 1 ? '' : 's'}`);
    } else if (isArtizenMode && lod === 'near') {
      lines.push(capitalize(node.kind));
    } else if (lod === 'near' && zoom >= META_LOD_ZOOM) {
      const gap = Math.max(0, (node.goal || 0) - (node.raised || 0));
      lines.push(`${capitalize(node.status)} · ${gap > 0 ? `${shortCurrency(gap)} to go` : 'Goal met'}`);
      lines.push(shortActionLabel(node));
    } else if (lod === 'near') {
      lines.push(`${capitalize(node.status)} · ${Math.round(progressPct(node))}% funded`);
    }

    const widths = lines.map((line, index) => {
      ctx.font = `${index === 0 ? '600' : '400'} ${index === 0 ? nameSize : metaSize}px Inter, system-ui, sans-serif`;
      return ctx.measureText(line).width;
    });

    const width = Math.max(...widths) + 10;
    const lineHeight = zoom >= META_LOD_ZOOM && lod === 'near' ? 12 : 11;
    const height = lines.length * lineHeight + 2;
    const bounds = {
      left: screen.x - width / 2,
      right: screen.x + width / 2,
      top: screen.y + visSize * zoom + 8,
      bottom: screen.y + visSize * zoom + 8 + height
    };

    if (!reserveLabel(bounds, labels)) return;

    lines.forEach((line, index) => {
      ctx.fillStyle = hexAlpha(index === 0 ? '#f8fafc' : '#cbd5e1', alpha * (index === 0 ? 0.92 : 0.76));
      ctx.font = `${index === 0 ? '600' : '400'} ${index === 0 ? nameSize : metaSize}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(line, node.x, node.y + visSize + (6 + index * lineHeight) / zoom);
    });
    ctx.textBaseline = 'alphabetic';
  }

  function reserveLabel(bounds, labels) {
    const overlaps = labels.some((other) => !(bounds.right < other.left || bounds.left > other.right || bounds.bottom < other.top || bounds.top > other.bottom));
    if (overlaps) return false;
    labels.push(bounds);
    return true;
  }

  // ---- Hit testing --------------------------------------------------------------

  function hitTest(mx, my) {
    const world = screenToWorld(mx, my);
    let best = null;
    let bestDist = Infinity;

    nodes.forEach((node) => {
      const dx = node.x - world.x;
      const dy = node.y - world.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const hitR = node.size * 1.45 + 6 / zoom;
      if (dist < hitR && dist < bestDist) {
        best = node;
        bestDist = dist;
      }
    });

    return best;
  }

  // ---- Events -------------------------------------------------------------------

  function bindEvents() {
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseLeave);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('dblclick', onDblClick);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);

    assocBtn?.addEventListener('click', () => {
      showAssoc = !showAssoc;
      assocBtn.setAttribute('aria-pressed', String(showAssoc));
      assocBtn.classList.toggle('active', showAssoc);
      scheduleRender();
    });

    focusBtn?.addEventListener('click', () => {
      if (focusMode) {
        exitFocus({ keepHistory: true });
      } else if (selectedNode && nodeMap[selectedNode.id]) {
        focusMode = true;
        focusBtn.setAttribute('aria-pressed', 'true');
        focusBtn.classList.add('active');
        showDetails(selectedNode);
        scheduleRender();
      }
    });

    resetBtn?.addEventListener('click', () => resetView(true));
    zoomInBtn?.addEventListener('click', () => zoomAtViewportCenter(1.25));
    zoomOutBtn?.addEventListener('click', () => zoomAtViewportCenter(0.8));
    backBtn?.addEventListener('click', goToPreviousFocus);
    closeDetailsBtn?.addEventListener('click', () => closeDetails({ clearSelection: true }));
    breadcrumbsEl?.addEventListener('click', onBreadcrumbClick);

    trackSel?.addEventListener('change', () => {
      filterTrack = trackSel.value;
      buildLayout();
      if (!selectedNode) applyHomeCamera(true);
      scheduleRender();
    });

    statusSel?.addEventListener('change', () => {
      filterStatus = statusSel.value;
      buildLayout();
      if (!selectedNode) applyHomeCamera(true);
      scheduleRender();
    });

    searchInput?.addEventListener('input', () => {
      filterSearch = searchInput.value;
      window.clearTimeout(searchTimeout);
      searchTimeout = window.setTimeout(() => {
        if (isArtizenMode && selectedNode) closeDetails({ clearSelection: true });
        buildLayout();
        const term = filterSearch.trim().toLowerCase();
        const exactNameMatches = term ? nodes.filter((node) => node.name.trim().toLowerCase() === term) : [];
        const partialNameMatches = term ? nodes.filter((node) => node.name.toLowerCase().includes(term)) : [];
        const uniqueMatch = exactNameMatches.length === 1
          ? exactNameMatches[0]
          : partialNameMatches.length === 1 ? partialNameMatches[0] : null;
        if (isArtizenMode && uniqueMatch) {
          focusNode(uniqueMatch, { recordHistory: false, openDetails: true });
        } else if (!selectedNode) {
          applyHomeCamera(true);
        }
        scheduleRender();
      }, 180);
    });

    detailsContentEl?.addEventListener('click', (event) => {
      const walletRead = event.target.closest('[data-read-wallet]');
      if (walletRead) {
        window.CanopyParticipation.readPublicWallet(allEntitiesById[walletRead.dataset.readWallet]);
        return;
      }
      const website = event.target.closest('[data-edit-website]');
      if (website) {
        window.CanopyParticipation.openWebsite(allEntitiesById[website.dataset.editWebsite]);
        return;
      }
      const exploreFund = event.target.closest('[data-fund-canopy]');
      if (exploreFund) {
        openFundCanopy(allEntitiesById[exploreFund.dataset.fundCanopy]);
        return;
      }
      if (event.target.closest('[data-return-artizen]')) {
        returnToArtizenCanopy();
        return;
      }
      const related = event.target.closest('[data-related-node]');
      if (!related) return;
      let node = nodeMap[related.dataset.relatedNode];
      if (!node && isArtizenMode) {
        filterTrack = 'all';
        if (trackSel) trackSel.value = 'all';
        buildLayout();
        node = nodeMap[related.dataset.relatedNode];
      }
      if (node) focusNode(node, { recordHistory: true, openDetails: true });
    });

    window.addEventListener('decentcanopy:wallet-change', () => {
      if (selectedNode?.kind === 'creator' && detailsPanel?.classList.contains('open')) showDetails(selectedNode);
    });

    window.addEventListener('decentcanopy:focus-entity', event => {
      if (!allEntitiesById[event.detail]) return;
      if (!nodeMap[event.detail]) {
        window.dispatchEvent(new CustomEvent('decentcanopy:select-entity', { detail: event.detail }));
        return;
      }
      focusNode(nodeMap[event.detail], { recordHistory: true, openDetails: true });
    });

    window.addEventListener('decentcanopy:select-entity', event => {
      const entity = allEntitiesById[event.detail];
      if (!entity) return;
      if (fundCanopyId) returnToArtizenCanopy();
      filterTrack = 'all';
      filterSearch = entity.name;
      if (trackSel) trackSel.value = 'all';
      if (searchInput) searchInput.value = filterSearch;
      buildLayout();
      if (nodeMap[entity.id]) focusNode(nodeMap[entity.id], { recordHistory: true, openDetails: true });
    });

    document.getElementById('participation-replay')?.addEventListener('click', () => {
      const events = [...new Map(allProjects.flatMap(node => node.participationEvents || [])
        .map(event => [event.id, event])).values()]
        .filter(event => nodeMap[event.target])
        .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
      const note = document.getElementById('participation-status');
      if (!events.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        note.textContent = events.length ? 'Reduced motion is enabled. View the historical activity in the data cards instead.'
          : 'No imported activity targets are visible. Import activity or clear the map filters first.';
        document.getElementById('participation-dialog').showModal();
        return;
      }
      activityReplay = {
        events, startedAt: performance.now(), interval: Math.min(700, 15000 / events.length),
        duration: Math.min(700, 15000 / events.length) * events.length,
      };
      document.getElementById('participation-replay').textContent = 'Replay reported history (not live)';
      scheduleRender();
    });

    document.addEventListener('keydown', (event) => {
      if (document.querySelector('dialog[open]') || event.target.closest('input, textarea, select')) return;
      if (event.key === 'Escape') {
        closeDetails({ clearSelection: true });
      } else if (event.key === '+' || event.key === '=') {
        zoomAtViewportCenter(1.18);
      } else if (event.key === '-') {
        zoomAtViewportCenter(0.85);
      } else if (event.key === '0') {
        resetView(true);
      }
    });
  }

  // ---- Mouse events -------------------------------------------------------------

  function onMouseMove(event) {
    const { mx, my } = mousePos(event);

    if (pointerDown) {
      const moved = Math.hypot(mx - pointerStart.x, my - pointerStart.y) > DRAG_THRESHOLD;
      if (moved) {
        suppressClick = true;
        isPanning = true;
        pan.x += mx - panLast.x;
        pan.y += my - panLast.y;
        panLast = { x: mx, y: my };
        canvas.style.cursor = 'grabbing';
        scheduleRender();
        return;
      }
    }

    const hit = hitTest(mx, my);
    if (hit !== hoveredNode) {
      hoveredNode = hit;
      canvas.style.cursor = hit ? 'pointer' : 'grab';
      if (hit) showTooltip(hit, mx, my);
      else hideTooltip();
      scheduleRender();
    } else if (hit) {
      moveTooltip(mx, my);
    }

    panLast = { x: mx, y: my };
  }

  function onMouseDown(event) {
    const { mx, my } = mousePos(event);
    pointerDown = true;
    isPanning = false;
    suppressClick = false;
    pointerStart = { x: mx, y: my };
    panLast = { x: mx, y: my };
  }

  function onMouseUp() {
    pointerDown = false;
    isPanning = false;
    canvas.style.cursor = hoveredNode ? 'pointer' : 'grab';
  }

  function onMouseLeave() {
    pointerDown = false;
    isPanning = false;
    hoveredNode = null;
    hideTooltip();
    scheduleRender();
  }

  function onClick(event) {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const { mx, my } = mousePos(event);
    const hit = hitTest(mx, my);
    if (hit) {
      focusNode(hit, { recordHistory: true, openDetails: true });
    } else if (focusMode) {
      exitFocus({ keepHistory: true });
    }
  }

  function onDblClick() {
    resetView(true);
  }

  function onWheel(event) {
    event.preventDefault();
    const { mx, my } = mousePos(event);
    const factor = Math.exp(-event.deltaY * 0.0015);
    zoomAtScreenPoint(mx, my, factor);
  }

  // ---- Touch events -------------------------------------------------------------

  function onTouchStart(event) {
    event.preventDefault();
    if (event.touches.length === 1) {
      pointerDown = true;
      isPanning = true;
      touchPrev = touch1(event);
      panLast = touchPrev;
    } else if (event.touches.length === 2) {
      pointerDown = false;
      isPanning = false;
      touchPinchDist = pinchDist(event);
    }
  }

  function onTouchMove(event) {
    event.preventDefault();
    if (event.touches.length === 1 && isPanning) {
      const cur = touch1(event);
      pan.x += cur.x - panLast.x;
      pan.y += cur.y - panLast.y;
      panLast = cur;
      scheduleRender();
    } else if (event.touches.length === 2) {
      const dist = pinchDist(event);
      if (touchPinchDist && dist > 0) {
        const rect = canvas.getBoundingClientRect();
        const mx = ((event.touches[0].clientX + event.touches[1].clientX) / 2) - rect.left;
        const my = ((event.touches[0].clientY + event.touches[1].clientY) / 2) - rect.top;
        zoomAtScreenPoint(mx, my, dist / touchPinchDist);
        touchPinchDist = dist;
      }
    }
  }

  function onTouchEnd() {
    pointerDown = false;
    isPanning = false;
    touchPrev = null;
    touchPinchDist = null;
  }

  function touch1(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.touches[0].clientX - rect.left,
      y: event.touches[0].clientY - rect.top
    };
  }

  function pinchDist(event) {
    const dx = event.touches[0].clientX - event.touches[1].clientX;
    const dy = event.touches[0].clientY - event.touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // ---- Focus / camera -----------------------------------------------------------

  function focusNode(node, options = {}) {
    const { recordHistory = true, openDetails = true } = options;
    const actual = nodeMap[node.id] || node;
    if (!actual) return;
    if (isArtizenMode && actual.kind === 'fund' && actual.id !== fundCanopyId) {
      openFundCanopy(actual);
      return;
    }

    if (recordHistory && selectedNode && selectedNode.id !== actual.id) {
      focusHistory.push(selectedNode.id);
      focusHistory = focusHistory.slice(-24);
    }

    selectedNode = actual;
    focusMode = true;
    focusBtn?.classList.add('active');
    focusBtn?.setAttribute('aria-pressed', 'true');
    updateBackButton();
    updateBreadcrumbs();

    if (openDetails) showDetails(actual);

    const target = focusTarget(actual);
    animateCameraTo(target.pan, target.zoom, 620);
    scheduleRender();
  }

  function openFundCanopy(fund) {
    if (!fund || fund.kind !== 'fund') return;
    fundCanopyId = fund.id;
    filterTrack = 'all';
    filterStatus = 'all';
    filterSearch = '';
    if (trackSel) trackSel.value = 'all';
    if (statusSel) statusSel.value = 'all';
    if (searchInput) searchInput.value = '';
    focusHistory = [];
    focusMode = false;
    focusBtn?.classList.remove('active');
    focusBtn?.setAttribute('aria-pressed', 'false');
    buildLayout();
    selectedNode = nodeMap[fund.id] || null;
    if (selectedNode) showDetails(selectedNode);
    updateFundCanopyDescription();
    updateBreadcrumbs();
    updateBackButton();
    applyHomeCamera(true);
    scheduleRender();
  }

  function returnToArtizenCanopy() {
    if (!fundCanopyId) return;
    fundCanopyId = null;
    closeDetails({ clearSelection: true });
    buildLayout();
    updateCanopyDescription();
    applyHomeCamera(true);
    scheduleRender();
  }

  function focusTarget(node) {
    const ids = new Set([node.id]);
    const parentId = parentById[node.id];
    if (parentId) ids.add(parentId);
    (childrenById[node.id] || []).slice(0, 6).forEach((id) => ids.add(id));
    Array.from(descendantCache[node.id] || []).slice(0, 8).forEach((id) => ids.add(id));

    let sx = 0;
    let sy = 0;
    let weight = 0;

    [...ids].forEach((id) => {
      const candidate = nodeMap[id];
      if (!candidate) return;
      const w = id === node.id ? 3 : 1;
      sx += candidate.x * w;
      sy += candidate.y * w;
      weight += w;
    });

    const centerX = weight ? sx / weight : node.x;
    const centerY = weight ? sy / weight : node.y;
    const targetZoom = clamp(1.45 + Math.max(0, 3 - Math.min(node.depth, 3)) * 0.38, 1.45, 3.3);

    return {
      zoom: targetZoom,
      pan: {
        x: -centerX * targetZoom,
        y: -centerY * targetZoom
      }
    };
  }

  function goToPreviousFocus() {
    while (focusHistory.length) {
      const previousId = focusHistory.pop();
      if (nodeMap[previousId]) {
        focusNode(nodeMap[previousId], { recordHistory: false, openDetails: true });
        updateBackButton();
        return;
      }
    }
    updateBackButton();
  }

  function exitFocus(options = {}) {
    const { keepHistory = true } = options;
    focusMode = false;
    selectedNode = null;
    focusBtn?.classList.remove('active');
    focusBtn?.setAttribute('aria-pressed', 'false');
    if (!keepHistory) focusHistory = [];
    closeDetails({ clearSelection: false, preserveFocusState: false });
    updateBackButton();
    updateBreadcrumbs();
    scheduleRender();
  }

  function resetView(animate) {
    focusHistory = [];
    focusMode = false;
    selectedNode = null;
    focusBtn?.classList.remove('active');
    focusBtn?.setAttribute('aria-pressed', 'false');
    closeDetails({ clearSelection: false, preserveFocusState: true });
    updateBackButton();
    updateBreadcrumbs();
    applyHomeCamera(animate);
  }

  function applyHomeCamera(animate) {
    homeCamera = computeHomeCamera();
    if (animate) {
      animateCameraTo(homeCamera.pan, homeCamera.zoom, 520);
    } else {
      pan = { ...homeCamera.pan };
      zoom = homeCamera.zoom;
      scheduleRender();
    }
  }

  function computeHomeCamera() {
    if (!nodes.length) {
      return { pan: { x: 0, y: 0 }, zoom: 1 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    nodes.forEach((node) => {
      minX = Math.min(minX, node.x - node.size - 40);
      minY = Math.min(minY, node.y - node.size - 40);
      maxX = Math.max(maxX, node.x + node.size + 40);
      maxY = Math.max(maxY, node.y + node.size + 40);
    });

    const W = Math.max(1, cw());
    const H = Math.max(1, ch());
    const width = maxX - minX + 160;
    const height = maxY - minY + 180;
    const fitZoom = clamp(Math.min(W / width, H / height), MIN_ZOOM, 1.05);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    return {
      zoom: fitZoom,
      pan: {
        x: -centerX * fitZoom,
        y: -centerY * fitZoom
      }
    };
  }

  function zoomAtViewportCenter(factor) {
    zoomAtScreenPoint(cw() / 2, ch() / 2, factor, { animate: true });
  }

  function zoomAtScreenPoint(mx, my, factor, options = {}) {
    const { animate = false, duration = 240 } = options;
    const targetZoom = clamp(zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const world = screenToWorld(mx, my);
    const targetPan = {
      x: mx - cw() / 2 - world.x * targetZoom,
      y: my - ch() / 2 - world.y * targetZoom
    };

    if (animate) animateCameraTo(targetPan, targetZoom, duration);
    else {
      zoom = targetZoom;
      pan = targetPan;
      scheduleRender();
    }
  }

  function animateCameraTo(targetPan, targetZoom, duration) {
    cameraAnimation = {
      fromPan: { ...pan },
      toPan: { ...targetPan },
      fromZoom: zoom,
      toZoom: clamp(targetZoom, MIN_ZOOM, MAX_ZOOM),
      start: performance.now(),
      duration
    };
    scheduleRender();
  }

  function stepCameraAnimation(now) {
    if (!cameraAnimation) return false;
    const elapsed = now - cameraAnimation.start;
    const t = cameraAnimation.duration <= 0 ? 1 : clamp(elapsed / cameraAnimation.duration, 0, 1);
    const eased = 1 - Math.pow(1 - t, 3);

    pan = {
      x: lerp(cameraAnimation.fromPan.x, cameraAnimation.toPan.x, eased),
      y: lerp(cameraAnimation.fromPan.y, cameraAnimation.toPan.y, eased)
    };
    zoom = lerp(cameraAnimation.fromZoom, cameraAnimation.toZoom, eased);

    if (t >= 1) {
      cameraAnimation = null;
      return false;
    }
    return true;
  }

  // ---- Tooltip ------------------------------------------------------------------

  function showTooltip(node, mx, my) {
    if (!tooltipEl) return;
    const connCount = isArtizenMode
      ? (allNeighborIds[node.id]?.size || 0)
      : adjacency[node.id] ? adjacency[node.id].size : 0;
    if (isArtizenMode) {
      tooltipEl.innerHTML =
        `<strong>${escHtml(node.name)}</strong>` +
        `<span class="tip-track" style="color:${TRACK_COLORS[node.track] || '#94a3b8'}">${capitalize(node.kind)}</span>` +
        `<span>${connCount} recorded connection${connCount === 1 ? '' : 's'}</span>`;
      tooltipEl.classList.add('visible');
      moveTooltip(mx, my);
      return;
    }
    tooltipEl.innerHTML =
      `<strong>${escHtml(node.name)}</strong>` +
      `<span class="tip-track" style="color:${TRACK_COLORS[node.track] || '#94a3b8'}">${escHtml(node.track)}</span>` +
      `<span>${capitalize(node.status)} &middot; ${Math.round(progressPct(node))}% funded</span>` +
      `<span>${node.stewards} steward${node.stewards !== 1 ? 's' : ''}` +
      (connCount ? ` &middot; ${connCount} connection${connCount !== 1 ? 's' : ''}` : '') +
      `</span>`;
    tooltipEl.classList.add('visible');
    moveTooltip(mx, my);
  }

  function moveTooltip(mx, my) {
    if (!tooltipEl) return;
    const W = cw();
    const H = ch();
    const offset = 16;
    const ttW = 230;
    const ttH = 84;
    const left = mx + offset + ttW > W ? mx - offset - ttW : mx + offset;
    const top = my + offset + ttH > H ? my - offset - ttH : my + offset;
    tooltipEl.style.left = left + 'px';
    tooltipEl.style.top = top + 'px';
  }

  function hideTooltip() {
    tooltipEl?.classList.remove('visible');
  }

  // ---- Details panel ------------------------------------------------------------

  function showDetails(node) {
    if (!detailsPanel || !detailsContentEl) return;

    const color = TRACK_COLORS[node.track] || '#94a3b8';
    if (isArtizenMode) {
      showArtizenDetails(node, color);
      return;
    }
    const progress = Math.round(progressPct(node));
    const gap = Math.max(0, (node.goal || 0) - (node.raised || 0));
    const matchFunding = typeof node.matchFunding === 'number' ? node.matchFunding : null;
    const communityRaised = typeof node.communityRaised === 'number' ? node.communityRaised : null;
    const parentId = parentById[node.id];
    const children = (childrenById[node.id] || []).map((id) => nodeMap[id]).filter(Boolean);
    const neighbours = [...(adjacency[node.id] || [])]
      .map((id) => nodeMap[id])
      .filter(Boolean)
      .filter((candidate) => candidate.id !== parentId && !children.some((child) => child.id === candidate.id));

    const parentHtml = parentId && nodeMap[parentId]
      ? `<div class="details-group">
          <h3>Parent branch</h3>
          <ul>
            <li style="border-left:3px solid ${TRACK_COLORS[nodeMap[parentId].track] || '#94a3b8'}">${escHtml(nodeMap[parentId].name)}</li>
          </ul>
        </div>`
      : '';

    const childHtml = children.length
      ? `<div class="details-group">
          <h3>Descendants (${children.length})</h3>
          <ul>${children.slice(0, 8).map((child) =>
            `<li style="border-left:3px solid ${TRACK_COLORS[child.track] || '#94a3b8'}">${escHtml(child.name)}</li>`
          ).join('')}</ul>
        </div>`
      : '';

    const assocHtml = neighbours.length
      ? `<div class="details-group">
          <h3>Shared stewardship + domain links (${neighbours.length})</h3>
          <ul>${neighbours.slice(0, 8).map((neighbour) =>
            `<li style="border-left:3px solid ${TRACK_COLORS[neighbour.track] || '#94a3b8'}">${escHtml(neighbour.name)} <small>· ${escHtml(relationLabel(node.id, neighbour.id))}</small></li>`
          ).join('')}</ul>
        </div>`
      : '';

    const repoLink = safeUrl(node.repoUrl)
      ? `<a href="${escAttr(safeUrl(node.repoUrl))}" target="_blank" rel="noreferrer">Repository ↗</a>`
      : '';
    const artizenLink = safeUrl(node.artizenUrl)
      ? `<a href="${escAttr(safeUrl(node.artizenUrl))}" target="_blank" rel="noreferrer">Artizen ↗</a>`
      : '';
    const linksHtml = repoLink || artizenLink ? `<div class="details-links">${repoLink}${artizenLink}</div>` : '';
    const seasonMeta = node.seasonTitle ? `<span>${escHtml(node.seasonTitle)}</span>` : '';
    const phaseMeta = node.phase ? `<span>${escHtml(capitalize(node.phase))} phase</span>` : '';
    const outcomeMeta = node.fundingOutcome ? `<span>${escHtml(capitalize(node.fundingOutcome))} outcome</span>` : '';
    const fundingFlowMeta = [
      communityRaised != null ? `<span>Community ${formatCurrency(communityRaised)}</span>` : '',
      matchFunding != null ? `<span>Match ${formatCurrency(matchFunding)}</span>` : ''
    ].join('');

    detailsContentEl.innerHTML =
      `<p class="details-track" style="color:${color}">${escHtml(node.track)}</p>` +
      `<h2 class="details-title">${escHtml(node.name)}</h2>` +
      `<div class="details-priority">` +
        `<h3>Season status</h3>` +
        `<p>${escHtml(primaryAction(node))}</p>` +
      `</div>` +
      `<p class="details-desc">${escHtml(node.description || '')}</p>` +
      `<div class="details-meta">` +
        `<span class="badge badge-${node.status}">${capitalize(node.status)}</span>` +
        seasonMeta +
        phaseMeta +
        outcomeMeta +
        `<span>${node.stewards} steward${node.stewards !== 1 ? 's' : ''}</span>` +
        `<span>Updated ${escHtml(node.lastUpdate)}</span>` +
        fundingFlowMeta +
      `</div>` +
      `<div class="details-funding">` +
        `<div class="funding-bar-track">` +
          `<div class="funding-bar-fill" style="width:${progress}%;background:${color}"></div>` +
        `</div>` +
        `<p>${formatCurrency(node.raised)} / ${formatCurrency(node.goal)} &middot; ${progress}%` +
          (gap > 0 ? ` &middot; ${formatCurrency(gap)} remaining` : ' &middot; Goal reached') +
        `</p>` +
        `<p>${escHtml(node.publicUpdate || '')}</p>` +
      `</div>` +
      parentHtml +
      childHtml +
      assocHtml +
      linksHtml;

    detailsPanel.classList.add('open');
    detailsPanel.setAttribute('aria-hidden', 'false');
  }

  function showArtizenDetails(node, color) {
    const neighbourIds = [...(allNeighborIds[node.id] || [])];
    const neighbours = neighbourIds
      .map((id) => nodeMap[id] || allEntitiesById[id])
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
    let linksHtml = safeUrl(node.artizenUrl)
      ? `<div class="details-links"><a href="${escAttr(safeUrl(node.artizenUrl))}" target="_blank" rel="noreferrer">${node.dataState === 'not-in-feed' ? 'Search Artizen ↗' : 'Artizen record ↗'}</a></div>`
      : '';
    if (safeUrl(node.artizenPageUrl)) {
      linksHtml += `<div class="details-links"><a href="${escAttr(safeUrl(node.artizenPageUrl))}" target="_blank" rel="noopener noreferrer">${node.kind === 'creator' ? 'Artizen profile' : node.kind === 'fund' ? 'Artizen fund page' : 'Artizen project page'} ↗</a></div>`;
    }
    const curatedLinks = (node.curatedLinks || []).filter(link => safeUrl(link.url));
    let curatedLinksHtml = '';
    if (curatedLinks.length) {
      curatedLinksHtml = `<div class="details-group curated-links"><h3>Creator-curated links</h3><ul>${curatedLinks.map(link => `<li><a href="${escAttr(safeUrl(link.url))}" target="_blank" rel="noopener noreferrer">${/discord/i.test(link.url) ? '💬 ' : /^https:\/\/github\.com\//i.test(link.url) ? '🛠️ ' : '🌐 '}${escHtml(link.label)} ↗</a>${link.note ? `<small>${escHtml(link.note)}</small>` : ''}</li>`).join('')}</ul><p class="participation-card-note">Public links curated by the creator in DecentCanopy.</p></div>`;
    }
    if (safeUrl(node.websiteUrl)) {
      linksHtml += `<div class="details-links"><a href="${escHtml(safeUrl(node.websiteUrl))}" target="_blank" rel="noopener noreferrer">Website: ${escHtml(new URL(node.websiteUrl).hostname)} ↗</a><p class="participation-card-note">Local participant website draft · unverified</p></div>`;
    }
    linksHtml += `<button type="button" class="toolbar-btn" data-edit-website="${escHtml(node.id)}">Edit website / wallet / location</button>`;
    const walletInfo = node.publicWallet;
    const network = walletInfo && window.CanopyParticipationModel.networks[walletInfo.chainId];
    const walletHtml = network
      ? `<div class="details-group"><h3>Public ledger link · ${escHtml(network.name)}</h3><div class="details-links"><a href="${network.explorer}/address/${walletInfo.address}" target="_blank" rel="noopener noreferrer">${escHtml(walletInfo.address)} ↗</a></div><p class="participation-card-note">Participant-declared wallet association. Ownership and Artizen identity unverified; not proof of purchases or personal wealth.</p><button class="toolbar-btn" type="button" data-read-wallet="${escHtml(node.id)}">Read public native balance (provider request)</button></div>` : '';
    const place = node.sharedLocation;
    const locationHtml = place
      ? `<div class="details-group"><h3>Opt-in location</h3><p>${escHtml(place.label)} · ${escHtml(place.precision)}${place.latitude != null ? ` · ${place.latitude}, ${place.longitude}` : ''}</p><p class="participation-card-note">${place.precision === 'space' ? 'Symbolic space placement, not an astronomical coordinate.' : 'Participant-declared location; local only and unverified.'}</p></div>` : '';
    const importedFunding = node.funding
      ? `<div class="details-funding"><strong>${formatCurrency(node.funding.raised)} raised / ${formatCurrency(node.funding.goal)} goal</strong><p>Season ${node.funding.season} · as of ${escHtml(node.funding.asOf)} · USD</p><p class="participation-card-note">Participant-reported, unverified; not live. Brightness reflects reported raised USD, not creator wealth.</p></div>` : '';
    const stats = node.publicStats;
    const publicStatsHtml = stats
      ? `<div class="details-funding details-funding--public"><strong>${formatCurrency(stats.total)} total on Artizen</strong>${stats.boosts ? `<p>${stats.boosts.toLocaleString()} boosts · ${formatCurrency(stats.bonus || 0)} boost bonus</p>` : ''}${stats.season7Submissions && stats.season7Submissions.length ? `<p>Season ${stats.season} submissions${stats.submissionStatus === 'pending' ? ' (pending review, not membership)' : ''}: ${stats.season7Submissions.map(escHtml).join(', ')}</p>` : ''}<p class="participation-card-note">${escHtml(stats.source)} · captured ${escHtml(stats.capturedAt)} · USD. Not a live feed.</p></div>` : '';
    const curationNoteHtml = node.curationNote ? `<p class="details-muted">${escHtml(node.curationNote)}</p>` : '';
    const events = node.participationEvents || [];
    const boosts = events.filter(event => event.type === 'boost' && event.actor === node.id);
    const boostTotal = boosts.reduce((sum, event) => sum + event.amount, 0);
    const boostTargets = [...new Set(boosts.map(event => event.target))].map(id => {
      const total = boosts.filter(event => event.target === id).reduce((sum, event) => sum + event.amount, 0);
      return `<li>${escHtml(allEntitiesById[id]?.name || id)}: ${total.toLocaleString()} reported boosts</li>`;
    }).join('');
    const activityHtml = events.length
      ? `<div class="details-group"><h3>Imported activity · not live</h3><p class="participation-card-note">Participant-reported, unverified. Coverage: ${escHtml(node.importCoverage)}. Not a verified lifetime tally.</p>${node.kind === 'creator' ? `<p>${boostTotal.toLocaleString()} reported boosts across this import</p><ul>${boostTargets}</ul>` : ''}<ul>${events.slice(-20).reverse().map(event => `<li>${escHtml(event.date)} · ${escHtml(event.type)} · ${event.type === 'purchase' ? formatCurrency(event.amount) : event.amount.toLocaleString()}${event.actor ? ' · reported actor: ' + escHtml(allEntitiesById[event.actor]?.name || event.actor) : ' · no actor attributed'}</li>`).join('')}</ul>${events.length > 20 ? '<p>Showing the latest 20 records. Export local data for the full history.</p>' : ''}</div>` : '';
    const tagsHtml = node.tags && node.tags.length
      ? `<div class="details-group"><h3>Tags</h3><p class="details-tags">${node.tags.slice(0, 18).map((tag) => `<span>${escHtml(tag)}</span>`).join('')}</p></div>`
      : '';
    const associationRows = neighbours.slice(0, 24).map((neighbour) => {
      const matchingEdges = allAssociations.filter((edge) =>
        (edge.source === node.id && edge.target === neighbour.id)
        || (edge.source === neighbour.id && edge.target === node.id)
      );
      const edgeNotes = matchingEdges.map((edge) => {
        const details = [edge.type.replace(/-/g, ' ')];
        if (edge.seasonNumbers && edge.seasonNumbers.length) {
          details.push('season ' + edge.seasonNumbers.slice().sort((a, b) => a - b).join(', '));
        }
        if (edge.records > 1) details.push(edge.records + ' source records');
        if (edge.createdAt) details.push('latest record ' + edge.createdAt.slice(0, 10));
        if (edge.sourceLabel) details.push(edge.sourceLabel);
        if (edge.note) details.push(edge.note);
        return details.join(' · ');
      });
      const connectionText = [...new Set(edgeNotes)].join(' / ') || 'Associated';
      return `<li><button type="button" class="related-entity" data-related-node="${escAttr(neighbour.id)}" style="--entity-color:${TRACK_COLORS[neighbour.track] || '#94a3b8'}"><strong>${escHtml(neighbour.name)}</strong><small>${escHtml(connectionText)}</small></button></li>`;
    }).join('');
    const associationsHtml = neighbours.length
      ? `<div class="details-group"><h3>Recorded connections (${neighbours.length})</h3><ul>${associationRows}</ul>${neighbours.length > 24 ? `<p class="details-muted">Showing 24 of ${neighbours.length}. Use the search box to find a specific connection.</p>` : ''}</div>`
      : '';
    const recordLabel = node.dataState === 'not-in-feed'
      ? '<p class="data-provenance data-provenance--curated">Curator-curated entry · no exact-name match in the latest Artizen index</p>'
      : `<p class="data-provenance">${escHtml(node.sourceLabel || 'Artizen public graph snapshot')}${node.generatedAt ? ` · snapshot ${escHtml(node.generatedAt.slice(0, 10))}` : ''}</p>`;
    const valueHtml = node.kind === 'fund' && node.available !== null
      ? `<div class="details-funding"><p>Available funds reported by Artizen: <strong>${formatCurrency(node.available)}</strong></p></div>`
      : '';
    const fundCanopyHtml = node.kind === 'fund' && node.id !== fundCanopyId
      ? `<button type="button" class="fund-canopy-explore" data-fund-canopy="${escAttr(node.id)}">Explore this fund canopy <span aria-hidden="true">↗</span><small>See its projects, related funds, and connected creators</small></button>`
      : '';
    const returnCanopyHtml = fundCanopyId
      ? '<button type="button" class="fund-canopy-return" data-return-artizen>← All Artizen projects and funds</button>'
      : '';
    const availableNotes = node.id.startsWith('local-creator:')
      ? '<p class="details-muted">Locally imported creator. A connected wallet does not verify this identity, Artizen account, or ownership.</p>'
      : node.kind === 'creator'
      ? '<p class="details-muted">Creator profile records are not included in the Artizen public graph feed. This creator node and its links were added locally at the creator’s request.</p>'
      : node.kind === 'project' && node.dataState !== 'not-in-feed'
        ? `<p class="details-muted">The public graph feed does not report project fundraising totals, creator identities, or artifact purchases${node.publicStats ? ' (the total above is a separate dated capture of the public Artizen page)' : ''}. A connection means the relationship label shown below; it is not proof of a ledger transaction.</p>`
        : '';

    const accountHtml = node.kind === 'creator' && window.CanopyArtizenAccount
      ? window.CanopyArtizenAccount.renderCreator(node, {
        associations: allAssociations,
        entitiesById: allEntitiesById,
        connectedWallet: window.decentCanopyWallet || null,
        networks: window.CanopyParticipationModel.networks,
        viewerId: window.CanopyOnboarding?.viewerId?.() || null,
        esc: escHtml,
      })
      : '';

    const imageUrl = safeUrl(node.image);
    const pageUrl = safeUrl(node.artizenPageUrl);
    const pageLabel = node.kind === 'creator' ? 'Artizen profile' : node.kind === 'fund' ? 'Artizen fund page' : 'Artizen project page';
    const linkImage = (img) => pageUrl
      ? `<a class="details-image-link" href="${escAttr(pageUrl)}" target="_blank" rel="noopener noreferrer" title="Open ${escAttr(node.name)} on Artizen">${img}</a>`
      : img;
    const imageHtml = !imageUrl ? '' : node.kind === 'creator'
      ? `<figure class="details-avatar">${linkImage(`<img src="${escAttr(imageUrl)}" alt="${escAttr(node.name)} profile picture${pageUrl ? ` — opens ${pageLabel}` : ''}" referrerpolicy="no-referrer" />`)}<figcaption>${escHtml(node.imageSource || 'Creator-supplied image')}</figcaption></figure>`
      : `<figure class="details-artwork">${linkImage(`<img src="${escAttr(imageUrl)}" alt="${escAttr(node.name)} artwork${pageUrl ? ` — opens ${pageLabel}` : ''}" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('figure').hidden=true" />`)}<figcaption>Artwork · Artizen public index${pageUrl ? ` · <a href="${escAttr(pageUrl)}" target="_blank" rel="noopener noreferrer">${pageLabel} ↗</a>` : ''}</figcaption></figure>`;

    detailsContentEl.innerHTML =
      `<p class="details-track" style="color:${color}">${capitalize(node.kind)}</p>` +
      imageHtml +
      `<h2 class="details-title">${escHtml(node.name)}</h2>` +
      recordLabel +
      `<p class="details-desc">${escHtml(node.description || '')}</p>` +
      curationNoteHtml +
      publicStatsHtml +
      curatedLinksHtml +
      valueHtml +
      importedFunding +
      walletHtml +
      locationHtml +
      activityHtml +
      fundCanopyHtml +
      returnCanopyHtml +
      tagsHtml +
      availableNotes +
      accountHtml +
      associationsHtml +
      linksHtml;

    detailsPanel.classList.add('open');
    detailsPanel.setAttribute('aria-hidden', 'false');
  }

  function closeDetails(options = {}) {
    const { clearSelection = true, preserveFocusState = false } = options;
    detailsPanel?.classList.remove('open');
    detailsPanel?.setAttribute('aria-hidden', 'true');
    if (clearSelection) selectedNode = null;
    if (!preserveFocusState) {
      focusMode = false;
      focusBtn?.classList.remove('active');
      focusBtn?.setAttribute('aria-pressed', 'false');
    }
    updateBreadcrumbs();
    scheduleRender();
  }

  // ---- Breadcrumbs + filters ----------------------------------------------------

  function populateFilters() {
    if (!trackSel || !statusSel) return;

    const trackLabel = trackSel.closest('.toolbar-filter')?.querySelector('label');
    if (trackLabel) trackLabel.textContent = isArtizenMode ? 'View' : 'Track';
    if (trackSel.options[0]) trackSel.options[0].textContent = isArtizenMode ? 'All entities' : 'All tracks';
    const tracks = [...new Set(allProjects.map((project) => isArtizenMode ? project.kind : project.track))].sort();
    tracks.forEach((track) => {
      const option = document.createElement('option');
      option.value = track;
      option.textContent = track === 'project' ? 'Projects' : track === 'fund' ? 'Funds' : track === 'creator' ? 'Creators' : track;
      trackSel.appendChild(option);
    });

    [...new Set(allProjects.map((project) => project.status))].sort().forEach((status) => {
      const option = document.createElement('option');
      option.value = status;
      option.textContent = capitalize(status);
      statusSel.appendChild(option);
    });
    if (isArtizenMode) statusSel.closest('.toolbar-filter')?.setAttribute('hidden', '');
  }

  function updateCanopyDescription() {
    const switchLinks = document.querySelectorAll('.canopy-switch a');
    switchLinks.forEach((link) => {
      const linkCanopy = new URL(link.href, window.location.href).searchParams.get('canopy');
      const isCurrent = isGreenTeaMode
        ? linkCanopy === 'green-tea'
        : isArtizenMode && linkCanopy !== 'green-tea';
      if (isCurrent) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    if (!isArtizenMode) return;
    document.querySelector('.spiral-shell')?.classList.add('artizen-mode');
    if (modeBadgeEl) {
      modeBadgeEl.querySelector('.artizen-logo').hidden = isGreenTeaMode;
      modeBadgeEl.querySelector('.mode-badge-label').textContent = isGreenTeaMode
        ? 'Green Tea Canopy · curated project cluster'
        : 'Artizen Canopy · public data snapshot';
      modeBadgeEl.classList.remove('mode-badge--prototype');
      modeBadgeEl.classList.add('mode-badge--artizen');
    }
    if (!visionNoteEl) return;
    if (fundCanopyId) {
      updateFundCanopyDescription();
      return;
    }
    if (isGreenTeaMode) {
      const summary = document.createElement('p');
      summary.textContent =
        'A focused cluster around The Green Tea Party and the projects associated with it. Dashed connections are locally curated; they describe project relationships, not verified transactions.';
      visionNoteEl.replaceChildren(summary);
      visionNoteEl.setAttribute('aria-label', 'Green Tea Canopy scope');
      const hint = document.querySelector('.spiral-hint');
      if (hint) hint.textContent = 'The Green Tea Party project cluster · Click a node to explore its connections';
      const legend = document.querySelector('.spiral-legend');
      if (legend) {
        legend.innerHTML =
          '<div class="legend-item"><span class="legend-dot" style="background:#34d399"></span> Projects</div>' +
          '<div class="legend-item"><span class="legend-dot" style="background:#fbbf24"></span> Curated connections</div>';
        legend.setAttribute('aria-label', 'Green Tea Canopy entity legend');
      }
      return;
    }
    const counts = artizenMetrics?.sourceCounts || {};
    const date = artizenMetrics?.generatedAt ? artizenMetrics.generatedAt.slice(0, 10) : 'date unavailable';
    const summary = document.createElement('p');
    summary.textContent =
      `Artizen public index · snapshot ${date} · ${counts.projects || 0} projects, ${counts.funds || 0} funds, ` +
      `${counts.relationships || 0} project–fund records. Lines reflect submitted, curated, or funded relationships. ` +
      'Node size reflects recorded links, not funding. Creator links are curated or locally participant-reported. The public feed has no purchase or ledger proofs. Imported funding halos and activity replay are unverified, historical, and local—not live statistics.';
    visionNoteEl.replaceChildren(summary);
    visionNoteEl.setAttribute('aria-label', 'Artizen data source and limitations');
    const hint = document.querySelector('.spiral-hint');
    if (hint) hint.textContent = 'Zoom to reveal connections · Click a node for source details · Search a project, fund, creator, or tag';
    const legend = document.querySelector('.spiral-legend');
    if (legend) {
      legend.innerHTML =
        '<div class="legend-item"><span class="legend-dot" style="background:#34d399"></span> Projects</div>' +
        '<div class="legend-item"><span class="legend-dot" style="background:#a78bfa"></span> Funds</div>' +
        '<div class="legend-item"><span class="legend-dot" style="background:#fbbf24"></span> Creators / curated links</div>';
      legend.setAttribute('aria-label', 'Artizen entity legend');
    }
  }

  function updateFundCanopyDescription() {
    if (!visionNoteEl || !fundCanopyId) return;
    const fund = allEntitiesById[fundCanopyId];
    if (!fund) return;
    const projectIds = new Set(
      allAssociations.flatMap((edge) => {
        if (edge.source === fundCanopyId && allEntitiesById[edge.target]?.kind === 'project') return [edge.target];
        if (edge.target === fundCanopyId && allEntitiesById[edge.source]?.kind === 'project') return [edge.source];
        return [];
      })
    );
    const ids = fundCanopyEntityIds(fundCanopyId);
    const connectedEntities = [...ids].map((id) => allEntitiesById[id]).filter(Boolean);
    const relatedFunds = connectedEntities.filter((entity) => entity.kind === 'fund' && entity.id !== fundCanopyId).length;
    const creators = connectedEntities.filter((entity) => entity.kind === 'creator').length;
    const publicRecords = allAssociations.filter((edge) =>
      (edge.source === fundCanopyId || edge.target === fundCanopyId)
      && edge.sourceLabel === 'Artizen public graph'
    ).reduce((total, edge) => total + (edge.records || 1), 0);
    const curatedLinks = allAssociations.filter((edge) =>
      ids.has(edge.source) && ids.has(edge.target)
      && String(edge.sourceLabel || '').includes('Creator-curated')
    ).length;

    const summary = document.createElement('p');
    summary.textContent =
      `${fund.name} fund canopy · ${projectIds.size} directly associated projects · ` +
      `${relatedFunds} linked funds · ${creators} connected creator${creators === 1 ? '' : 's'}. ` +
      `${publicRecords} direct Artizen project–fund records; ${curatedLinks} local curated connection${curatedLinks === 1 ? '' : 's'}. ` +
      'Links show recorded or curated associations, not verified transactions.';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'fund-canopy-return';
    back.textContent = '← All Artizen projects and funds';
    back.addEventListener('click', returnToArtizenCanopy);
    visionNoteEl.replaceChildren(summary, back);
    window.CanopyDataNotes?.open();
    visionNoteEl.setAttribute('aria-label', `${fund.name} fund canopy summary`);
    if (modeBadgeEl) modeBadgeEl.querySelector('.mode-badge-label').textContent = `${fund.name} · fund canopy`;
    const hint = document.querySelector('.spiral-hint');
    if (hint) hint.textContent = 'A fund-centered canopy · Click connected funds to explore their project clusters';
  }

  function updateBreadcrumbs() {
    if (!breadcrumbsEl) return;

    const crumbs = [{ label: 'Home', type: 'home' }];

    if (selectedNode && nodeMap[selectedNode.id]) {
      const chain = [];
      let currentId = selectedNode.id;
      while (currentId) {
        const current = nodeMap[currentId];
        if (!current) break;
        chain.unshift({ label: current.name, type: 'node', id: current.id });
        currentId = parentById[currentId];
      }
      if (chain.length) {
        crumbs.push({ label: chain[0].label, type: 'root', id: chain[0].id, track: nodeMap[chain[0].id]?.track });
        chain.slice(1).forEach((crumb) => crumbs.push(crumb));
      }
    } else if (filterTrack !== 'all') {
      const cluster = trackClusters.find((entry) => entry.track === filterTrack);
      if (cluster) crumbs.push({ label: cluster.track, type: 'root', id: cluster.rootId, track: cluster.track });
    }

    const seen = new Set();
    breadcrumbsEl.innerHTML = crumbs
      .filter((crumb, index) => {
        const key = `${crumb.type}:${crumb.id || crumb.label}:${index}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((crumb, index) => {
        const attrs = crumb.type === 'home'
          ? 'data-home="true"'
          : `data-node-id="${escAttr(crumb.id || '')}"`;
        const classes = ['crumb-btn'];
        if (selectedNode && crumb.id === selectedNode.id) classes.push('active');
        const sep = index === 0 ? '' : '<span class="crumb-sep" aria-hidden="true">›</span>';
        const style = crumb.track ? ` style="--crumb-color:${TRACK_COLORS[crumb.track] || '#94a3b8'}"` : '';
        return `${sep}<button type="button" class="${classes.join(' ')}" ${attrs}${style}>${escHtml(crumb.label)}</button>`;
      })
      .join('');
  }

  function onBreadcrumbClick(event) {
    const btn = event.target.closest('button');
    if (!btn) return;
    if (btn.dataset.home === 'true') {
      resetView(true);
      return;
    }
    const nodeId = btn.dataset.nodeId;
    if (nodeId && nodeMap[nodeId]) {
      focusNode(nodeMap[nodeId], { recordHistory: true, openDetails: true });
    }
  }

  function updateBackButton() {
    if (!backBtn) return;
    backBtn.disabled = focusHistory.length === 0;
    backBtn.setAttribute('aria-disabled', String(backBtn.disabled));
  }

  // ---- Utilities ----------------------------------------------------------------

  function mousePos(event) {
    const rect = canvas.getBoundingClientRect();
    return { mx: event.clientX - rect.left, my: event.clientY - rect.top };
  }

  function worldBounds(margin) {
    const W = cw();
    const H = ch();
    return {
      left: (-W / 2 - pan.x) / zoom - margin,
      right: (W / 2 - pan.x) / zoom + margin,
      top: (-H / 2 - pan.y) / zoom - margin,
      bottom: (H / 2 - pan.y) / zoom + margin
    };
  }

  function edgeVisible(source, target, bounds) {
    const minX = Math.min(source.x, target.x) - 80 / zoom;
    const maxX = Math.max(source.x, target.x) + 80 / zoom;
    const minY = Math.min(source.y, target.y) - 80 / zoom;
    const maxY = Math.max(source.y, target.y) + 80 / zoom;
    return !(maxX < bounds.left || minX > bounds.right || maxY < bounds.top || minY > bounds.bottom);
  }

  function pointInBounds(x, y, bounds, pad) {
    return x >= bounds.left - pad && x <= bounds.right + pad && y >= bounds.top - pad && y <= bounds.bottom + pad;
  }

  function screenToWorld(mx, my) {
    return {
      x: (mx - cw() / 2 - pan.x) / zoom,
      y: (my - ch() / 2 - pan.y) / zoom
    };
  }

  function worldToScreen(x, y) {
    return {
      x: x * zoom + cw() / 2 + pan.x,
      y: y * zoom + ch() / 2 + pan.y
    };
  }

  function focusContextIds() {
    if (!focusMode || !selectedNode) return null;
    const ids = new Set([selectedNode.id]);
    const parentId = parentById[selectedNode.id];
    if (parentId) ids.add(parentId);
    (childrenById[selectedNode.id] || []).forEach((id) => ids.add(id));
    (descendantCache[selectedNode.id] || []).forEach((id) => ids.add(id));
    (adjacency[selectedNode.id] || []).forEach((id) => ids.add(id));
    return ids;
  }

  function progressPct(node) {
    return node.goal > 0 ? Math.min(100, (node.raised / node.goal) * 100) : 0;
  }

  function primaryAction(node) {
    const gap = Math.max(0, (node.goal || 0) - (node.raised || 0));
    if (node.status === 'curation') {
      return gap > 0
        ? `Finish the curation shortlist and close the ${formatCurrency(gap)} launch gap before the competition phase opens.`
        : 'Finish the curation shortlist and prepare the season for competition.';
    }
    if (node.status === 'competition') {
      return gap > 0
        ? `Keep artifact sales moving and raise the remaining ${formatCurrency(gap)} before the match pool closes.`
        : 'Keep artifact sales moving and record the final allocation outcome.';
    }
    if (node.status === 'funded') {
      return 'Capture the allocation result, document what the match funding unlocked, and seed the next branch.';
    }
    if (node.status === 'archived') {
      return 'Archive the learnings, keep the season record public, and note what should re-enter curation next time.';
    }
    return gap > 0
      ? `Coordinate the next steward action and raise the remaining ${formatCurrency(gap)} needed to reach this project’s goal.`
      : 'Document the next milestone, keep steward roles clear, and seed the most promising child branch.';
  }

  function shortActionLabel(node) {
    if (node.status === 'curation') return 'Needs curation';
    if (node.status === 'competition') return 'In competition';
    if (node.status === 'funded') return 'Funded';
    if (node.status === 'archived') return 'Archived';
    return Math.max(0, (node.goal || 0) - (node.raised || 0)) > 0 ? 'Needs next action' : 'Ready for next branch';
  }

  function relationLabel(aId, bId) {
    const raw = relationTypes[relationKey(aId, bId)] || 'same-track';
    return raw.replace(/-/g, ' ');
  }

  function relationKey(aId, bId) {
    return [aId, bId].sort().join('::');
  }

  function associationPriority(type) {
    return ASSOCIATION_PRIORITY[type] || 0;
  }

  function stableUnit(seedInput) {
    const text = String(seedInput);
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return ((hash >>> 0) % 1000) / 1000;
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(value || 0);
  }

  function shortCurrency(value) {
    if (value >= 1000) return `$${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
    return formatCurrency(value);
  }

  function hexAlpha(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
  }

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function capitalize(text) {
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
  }

  function escHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escAttr(text) {
    return String(text).replace(/"/g, '%22');
  }

  function safeUrl(url) {
    if (!url) return null;
    try {
      var parsed = new URL(String(url));
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
      return parsed.href;
    } catch (_) {
      return null;
    }
  }

  // ---- Boot ---------------------------------------------------------------------

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
