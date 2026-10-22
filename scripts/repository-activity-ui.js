(function (root) {
  'use strict';
  const Model = root.CanopyRepositoryActivity;
  let data = null, failure = '', pending = null, listener = () => {};
  const tracker = Model.referenceTracker();
  let pulseQueue = [], referenceNotice = 'Initial snapshot is a baseline, not new live events.';
  const queue = (events, replay) => {
    const startedAt = performance.now();
    pulseQueue = animate() ? events.slice(0, 24).map((event, index) => ({
      event, startedAt: startedAt + index * 150, replay
    })) : [];
  };
  const element = (tag, text) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  };
  function link(url, text) {
    const node = element('a', text);
    node.href = url;
    node.target = '_blank';
    node.rel = 'noopener noreferrer';
    return node;
  }
  function load() {
    if (pending) return pending;
    pending = fetch('data/repository-activity.json', { cache: 'no-store', credentials: 'omit' })
      .then(response => {
        if (!response.ok) throw new Error(`Snapshot HTTP ${response.status}`);
        return response.json();
      }).then(Model.validate).then(value => {
        const fresh = tracker.observe(Model.references(value));
        data = value;
        failure = '';
        if (fresh.length) {
          queue(fresh, false);
          referenceNotice = `${fresh.length} newly observed cross-project reference updates${fresh.length > 24 ? '; first 24 queued' : ''}. Observation time is not event time.`;
        }
        updateReferences();
        return value;
      }).catch(error => {
        pulseQueue = [];
        failure = `Repository activity unavailable: ${error.message}. Previous observations, if shown, are not live.`;
        console.warn('[canopy-activity]', failure);
        throw error;
      }).finally(() => { pending = null; });
    return pending;
  }
  function summary() {
    if (failure) return failure;
    if (!data) return 'Loading public GitHub activity…';
    const unknown = data.repositories.filter(row => Model.heat(row) === 'unknown').length;
    return `GitHub snapshot ${data.generatedAt} · ${data.repositories.length} public repositories · ${unknown} unknown/stale. Scheduled about every 15 minutes; deployment/queue delays apply. Browser checks every minute. Not push-based real time.`;
  }
  function mount(container, node) {
    container.querySelector('[data-repository-activity]')?.remove();
    const repos = Model.repositoriesForNode(node);
    if (!repos.length) return;
    const section = element('section');
    section.className = 'details-group';
    section.setAttribute('data-repository-activity', '');
    section.append(element('h3', 'Public GitHub build activity'));
    section.append(element('p', summary()));
    for (const repo of repos) {
      const row = data?.repositories.find(item => item.repo === repo);
      section.append(link(`https://github.com/${repo}`, repo));
      if (!row || row.status === 'unavailable') {
        section.append(element('p', row?.error || 'Not checked in this snapshot. Published repository links enroll on the next collector run; local drafts do not.'));
        continue;
      }
      const state = failure ? 'unknown' : Model.heat(row);
      section.append(element('p', row.commits7d === null
        ? 'Commit sample unavailable; no count established. This is not zero activity.'
        : `${Model.LEVELS[state].label} · ${row.commits7d} commits in the seven-day window, sampled from at most 100 default-branch commits${row.capped ? ' (sample capped; not an exhaustive total)' : ''}.`));
      section.append(element('small', `Checked ${row.checkedAt} · Window starts ${row.windowStart} · Branch ${row.defaultBranch}${row.archived ? ' · Archived repository' : ''}`));
      section.append(element('p', `${row.openIssuesAndPRs} open issues + pull requests combined. A count is not a readiness or impact score.`));
      if (row.latestCommit) section.append(link(row.latestCommit.url, `Latest sampled commit ${row.latestCommit.sha.slice(0, 7)} · ${row.latestCommit.date}`));
      if (row.release) section.append(element('p'), link(row.release.url, `Latest published release ${row.release.tag} · ${row.release.publishedAt}`));
      else section.append(element('p', row.status === 'ok' ? 'No published release returned by GitHub.' : 'Latest release not confirmed.'));
      if (row.error) section.append(element('p', row.error));
      if (row.crossReferenceStatus) section.append(element('p',
        `Cross-project reference coverage: ${row.crossReferenceStatus}${row.referencesCapped ? ' · bounded sample capped' : ''}. Issue comments, source diffs and private work are not scanned.`));
    }
    const events = Model.references(data).filter(event => repos.includes(event.source) || repos.includes(event.target));
    if (events.length) {
      section.append(element('h4', 'Explicit cross-project references'));
      const list = element('ul');
      events.slice(0, 10).forEach(event => list.append(referenceItem(event)));
      section.append(list);
    }
    section.append(element('p', 'Heat uses commit timestamps, not live events, effort, quality or project worth. Connection accents show endpoint activity only—not collaboration, integration, payments or ownership. Capabilities remain separately reviewed.'));
    container.append(section);
  }
  function referenceItem(event) {
    const item = element('li');
    item.append(link(event.url, `${event.label}: ${event.source} → ${event.target}`),
      element('small', ` ${event.kind} · ${event.date}. Explicit reference, not verified integration.`));
    return item;
  }
  function updateReferences() {
    const status = document.getElementById?.('repository-reference-status');
    const list = document.getElementById?.('repository-reference-list');
    if (!status || !list) return;
    if (failure || !data?.repositories.some(row => row.crossReferenceStatus)) {
      status.textContent = failure || 'Cross-project references have not been collected in this snapshot. This is not zero community activity.';
      list.replaceChildren();
      return;
    }
    const events = failure ? [] : Model.references(data);
    const incomplete = data.repositories.filter(row => row.status === 'unavailable' ||
      row.crossReferenceStatus !== 'ok' || Model.heat(row) === 'unknown' || row.referencesCapped).length;
    status.textContent = `${events.length} fresh sampled cross-project references in the last 7 days; ${incomplete} repositories have capped, partial, missing or stale coverage. ${referenceNotice} Only existing visible connections can pulse; unmatched references stay in this list. First 20 shown. Absence is not proof of no community activity.`;
    list.replaceChildren(...events.slice(0, 20).map(referenceItem));
  }
  function start(onUpdate) {
    listener = onUpdate;
    const controls = document.getElementById('repository-activity-controls');
    const status = document.getElementById('repository-activity-status');
    const refresh = document.getElementById('repository-activity-refresh');
    const heat = document.getElementById('repository-activity-heat');
    const motion = document.getElementById('repository-activity-motion');
    const replay = document.getElementById('repository-reference-replay');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    controls.hidden = false;
    document.querySelector('.data-notes-tab-label').textContent = 'Data / build activity';
    motion.checked = !reduced.matches;
    reduced.addEventListener('change', () => {
      if (reduced.matches) motion.checked = false;
      pulseQueue = [];
      replay.disabled = !animate();
      listener();
    });
    const update = async () => {
      refresh.disabled = true;
      try { await load(); } catch { /* load records the explicit visible error. */ }
      refresh.disabled = false;
      status.textContent = summary();
      updateReferences();
      listener();
    };
    refresh.addEventListener('click', update);
    const changeMotion = () => {
      pulseQueue = [];
      replay.disabled = !animate();
      listener();
    };
    heat.addEventListener('change', changeMotion);
    motion.addEventListener('change', changeMotion);
    replay.disabled = !animate();
    replay.addEventListener('click', () => {
      const events = failure ? [] : Model.references(data);
      queue(events, true);
      referenceNotice = `Historical replay requested: ${Math.min(24, events.length)} sampled references, not live events.`;
      updateReferences();
      listener();
    });
    window.setInterval(() => { if (!document.hidden) update(); }, 60000);
    document.addEventListener('visibilitychange', () => {
      pulseQueue = [];
      if (!document.hidden) update();
    });
    update();
  }
  function nodeHeat(node) {
    return failure ? 'unknown' : Model.nodeHeat(data, node);
  }
  function edgeHeat(source, target) {
    return failure ? { source: 'unknown', target: 'unknown', activeTogether: false } : Model.edgeHeat(data, source, target);
  }
  function enabled() { return document.getElementById('repository-activity-heat')?.checked; }
  function animate() {
    return enabled() && !document.hidden && document.getElementById('repository-activity-motion')?.checked &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function pulses() {
    if (!animate() || failure) return [];
    const now = performance.now();
    const eligible = new Set(Model.references(data).map(event => event.id));
    pulseQueue = pulseQueue.filter(pulse => now - pulse.startedAt < 3000 && eligible.has(pulse.event.id));
    return pulseQueue.map(pulse => ({ ...pulse, progress: (now - pulse.startedAt) / 3000 }));
  }
  const api = { start, load, mount, nodeHeat, edgeHeat, enabled, animate, pulses, getData: () => data };
  root.CanopyRepositoryActivityUI = api;
}(typeof window !== 'undefined' ? window : globalThis));
