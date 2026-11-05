(function (root) {
  'use strict';
  const JOLLY = '0x807061df657a7697c04045da7d16d941861caabc';
  const OFFICE = 'https://a-decent-agency.github.io/';
  const model = root.CanopySupporterModel;
  const isJolly = node => node?.kind === 'creator' && node.creatorRecord?.wallet?.toLowerCase() === JOLLY;
  function rows(agency, progress, board) {
    if (!Array.isArray(agency?.projects) || progress?.schemaVersion !== 2 || !Array.isArray(progress.repositories)
      || !Number.isFinite(Date.parse(progress.checkedAt)) || board?.schemaVersion !== 1 || !Array.isArray(board.items)) {
      throw new Error('Public Planning Office data has an unsupported shape.');
    }
    return agency.projects.filter(p => model.normalizeRepo(p.repo)).map(p => {
      const repo = model.normalizeRepo(p.repo);
      const observation = progress.repositories.find(r => model.normalizeRepo(r.repository) === repo);
      const tasks = p.entityId ? [] : board.items.filter(i => model.normalizeRepo(i.fields?.Project || i.repository) === repo);
      const portfolio = tasks.find(i => i.fields?.Kind === 'Portfolio');
      const site = p.entityId ? `entity:${p.entityId}` : `project:${repo}`;
      const url = new URL(OFFICE); url.searchParams.set('site', site);
      return { name: p.name, repo, currentState: p.currentState, nextAction: p.nextAction, reviewedAt: p.reviewedAt,
        observation, tasks: tasks.filter(i => i.fields?.Kind !== 'Portfolio'), status: portfolio?.fields?.Status || 'Context / not on the active board',
        horizon: portfolio?.fields?.Horizon || '', url: url.href };
    });
  }
  function el(tag, text) {
    const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node;
  }
  function link(url, label) {
    const node = el('a', label); node.href = model.httpsUrl(url); node.target = '_blank'; node.rel = 'noopener noreferrer'; return node;
  }
  async function mount(container, node) {
    const section = container?.querySelector('[data-jolly-planning]');
    if (!section || !isJolly(node)) return;
    const status = el('p', 'Loading the same public project and milestone feeds used by the Planning Office…');
    status.setAttribute('role', 'status'); section.replaceChildren(status);
    try {
      const get = async url => {
        const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`Public feed HTTP ${response.status}`);
        return response.json();
      };
      const [agency, progress, board] = await Promise.all([
        get('data/agency-map.json'), get(`${OFFICE}data/progress.json`), get(`${OFFICE}data/project.json`),
      ]);
      const projects = rows(agency, progress, board);
      if (!section.isConnected) return;
      status.textContent = `${projects.length} public project sites · Office source observations ${progress.checkedAt} · board export ${board.exportedAt}. Dated source reports, not live deployments or completion certification. Your signed creator record is unchanged.`;
      section.append(link(OFFICE, 'Open the full interactive Planning Office ↗'));
      const searchLabel = el('label', 'Find one of Jolly’s projects'), search = el('input');
      search.type = 'search'; search.placeholder = 'Project or status'; searchLabel.append(search);
      const list = el('div'); section.append(searchLabel, list);
      function render() {
        list.replaceChildren();
        const query = search.value.toLowerCase().trim();
        const selected = projects.filter(p => `${p.name} ${p.repo} ${p.status} ${p.horizon}`.toLowerCase().includes(query));
        if (!selected.length) list.append(el('p', 'No matching public projects.'));
        for (const p of selected) {
          const item = el('details'); item.className = 'creator-project-card';
          item.append(el('summary', `${p.name} · ${p.status}${p.horizon ? ` / ${p.horizon}` : ''}`));
          const body = el('div'); body.className = 'creator-project-card-body';
          body.append(el('p', p.currentState || 'No curated status available.'), el('p', `Next: ${p.nextAction || 'Not specified'}`),
            el('small', `Curated review: ${p.reviewedAt || 'undated'}. ${p.observation ? `Repository observation: ${p.observation.state}; ${p.observation.error || p.observation.checkedAt || 'no successful timestamp'}` : 'No repository observation in the Office feed.'}`));
          for (const s of p.observation?.structures || []) {
            if (model.httpsUrl(s.url)) body.append(link(s.url, `${s.kind}: ${s.name} · ${s.closed}/${s.closed + s.open} issues closed (${s.closures?.notPlanned || 0} not planned; closure is not delivery)`));
          }
          for (const task of p.tasks) {
            const text = `${task.title} · ${task.fields?.Status || 'Unspecified'} / ${task.fields?.Horizon || 'Unspecified'}`;
            if (model.httpsUrl(task.url)) body.append(link(task.url, text));
            else body.append(el('p', text));
          }
          body.append(link(p.url, 'Visit this Planning Office site ↗'), link(`https://github.com/${p.repo}`, 'Public repository ↗'));
          item.append(body); list.append(item);
        }
      }
      search.addEventListener('input', render); render();
    } catch (error) {
      if (!section.isConnected) return;
      status.textContent = `Planning Office mirror unavailable: ${error.message}. No stale profile data substituted.`;
      const retry = el('button', 'Retry public Planning Office feeds'); retry.type = 'button';
      retry.addEventListener('click', () => mount(container, node));
      section.append(retry, link(OFFICE, 'Open the Planning Office directly ↗'));
    }
  }
  const api = { JOLLY, OFFICE, isJolly, rows, mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CanopyPlanningOffice = api;
}(typeof window !== 'undefined' ? window : globalThis));
