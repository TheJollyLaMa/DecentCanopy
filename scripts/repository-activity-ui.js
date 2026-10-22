(function (root) {
  'use strict';
  const Model = root.CanopyRepositoryActivity;
  let data = null, failure = '', pending = null, listener = () => {};
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
        data = value;
        failure = '';
        return value;
      }).catch(error => {
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
    }
    section.append(element('p', 'Heat uses commit timestamps, not live events, effort, quality or project worth. Connection accents show endpoint activity only—not collaboration, integration, payments or ownership. Capabilities remain separately reviewed.'));
    container.append(section);
  }
  function start(onUpdate) {
    listener = onUpdate;
    const controls = document.getElementById('repository-activity-controls');
    const status = document.getElementById('repository-activity-status');
    const refresh = document.getElementById('repository-activity-refresh');
    const heat = document.getElementById('repository-activity-heat');
    const motion = document.getElementById('repository-activity-motion');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    controls.hidden = false;
    document.querySelector('.data-notes-tab-label').textContent = 'Data / build activity';
    motion.checked = !reduced.matches;
    reduced.addEventListener('change', () => {
      if (reduced.matches) motion.checked = false;
      listener();
    });
    const update = async () => {
      refresh.disabled = true;
      try { await load(); } catch { /* load records the explicit visible error. */ }
      refresh.disabled = false;
      status.textContent = summary();
      listener();
    };
    refresh.addEventListener('click', update);
    heat.addEventListener('change', listener);
    motion.addEventListener('change', listener);
    window.setInterval(() => { if (!document.hidden) update(); }, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });
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
  const api = { start, load, mount, nodeHeat, edgeHeat, enabled, animate, getData: () => data };
  root.CanopyRepositoryActivityUI = api;
}(typeof window !== 'undefined' ? window : globalThis));
