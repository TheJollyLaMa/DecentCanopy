(function (root) {
  'use strict';
  const SOURCE = 'https://artizen.fyi/projects?season=7';
  const COLUMNS = ['Sales', 'Venus sales', 'S+VS', 'Match', 'S+VS+M', 'Venus extras', 'Prize', 'Bonus', 'Raised', 'V/S', 'M/S', 'P/S', 'B/S', 'R/S'];
  const FIELDS = ['sales', 'venusSales', 'salesWithVenus', 'match', 'salesWithMatch', 'venusExtras', 'prize', 'bonus', 'raised'];
  function parseLeaderboard(html) {
    const table = /<table\b[^>]*id="artizen-projects-table"[^>]*>([\s\S]*?)<\/table>/.exec(html)?.[1];
    if (!table || !/<option value="7" selected>/.test(html)) throw new Error('Expected the public Season 7 project leaderboard.');
    const headers = [...table.matchAll(/<th\b[^>]*>([^<]*)<\/th>/g)].map(m => m[1]);
    if (JSON.stringify(headers) !== JSON.stringify(['Project', ...COLUMNS])) throw new Error('Leaderboard columns changed; refusing ambiguous financial data.');
    const result = new Map();
    for (const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
      const cells = [...row[1].matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/g)];
      if (!cells.length) continue;
      if (cells.length !== 15) throw new Error('Unexpected leaderboard row shape.');
      const slug = decodeURIComponent(/href="\/projects\/([^"?]+)"/.exec(cells[0][2])?.[1] || '');
      if (!slug || result.has(slug)) throw new Error('Missing or duplicate project identity in leaderboard.');
      const values = cells.slice(1, 10).map(cell => {
        const raw = /\bdata-order="([^"]*)"/.exec(cell[1])?.[1];
        if (!raw || !/^\d+(?:\.\d+)?$/.test(raw) || !Number.isFinite(Number(raw))) throw new Error(`Invalid financial value for ${slug}.`);
        return Number(raw);
      });
      const metrics = Object.fromEntries(FIELDS.map((field, i) => [field, values[i]]));
      const expected = metrics.sales + metrics.venusSales + metrics.match + metrics.venusExtras + metrics.prize + metrics.bonus;
      if (Math.abs(expected - metrics.raised) > .01) throw new Error(`Raised breakdown does not reconcile for ${slug}.`);
      result.set(slug, metrics);
    }
    if (!result.size) throw new Error('Leaderboard contains no usable project rows.');
    return result;
  }
  function validate(data) {
    if (data?.format !== 'decentcanopy-artizen-financial-captures' || data.version !== 1 || data.source !== SOURCE
      || !Number.isFinite(Date.parse(data.capturedAt)) || data.season !== 7 || !Array.isArray(data.projects)) throw new Error('Invalid supplementary financial capture.');
    const ids = new Set();
    for (const p of data.projects) {
      if (typeof p.id !== 'string' || !p.id.startsWith('artizen-project:') || ids.has(p.id) || !p.slug) throw new Error('Invalid or duplicate financial project identity.');
      ids.add(p.id);
      if (!['captured', 'not-in-season-leaderboard'].includes(p.status)) throw new Error('Invalid capture status.');
      if (p.status !== 'captured') {
        if (p.metrics !== null) throw new Error('Missing project totals must be unknown, not zero.');
        continue;
      }
      if (!p.metrics || FIELDS.some(field => typeof p.metrics[field] !== 'number' || !Number.isFinite(p.metrics[field]) || p.metrics[field] < 0)) throw new Error('Invalid captured financial numbers.');
      const m = p.metrics;
      if (Math.abs(m.sales + m.venusSales + m.match + m.venusExtras + m.prize + m.bonus - m.raised) > .01) throw new Error('Captured financial breakdown does not reconcile.');
    }
    return data;
  }
  function apply(graph, data) {
    validate(data);
    const rows = new Map(data.projects.map(p => [p.id, p]));
    return { ...graph, projects: graph.projects.map(node => {
      const row = rows.get(node.id);
      if (!row || row.slug !== node.slug) return node;
      return { ...node, financialCapture: { ...row, capturedAt: data.capturedAt, source: data.source, season: data.season } };
    }) };
  }
  function render(capture, escape, currency) {
    if (!capture) return '';
    const source = `<a href="${escape(capture.source)}" target="_blank" rel="noopener noreferrer">artizen.fyi Season ${capture.season} leaderboard ↗</a>`;
    if (capture.status !== 'captured') return `<div class="details-group"><h3>Supplementary financial check</h3><p>Not listed in the checked Season 7 leaderboard. Amount unknown, not $0.</p><small>${source} · checked ${escape(capture.capturedAt.slice(0, 10))}</small></div>`;
    const m = capture.metrics;
    return `<div class="details-funding"><h3>Separate Season 7 financial capture</h3><strong>${currency(m.raised)} reported raised</strong>
      <dl>${[['Sales (excluding Venus)', m.sales], ['Venus sales', m.venusSales], ['Match', m.match], ['Venus extras', m.venusExtras], ['Prize', m.prize], ['Bonus', m.bonus]].map(([label, amount]) => `<dt>${label}</dt><dd>${currency(amount)}</dd>`).join('')}</dl>
      <p class="participation-card-note">${source} · captured ${escape(capture.capturedAt.slice(0, 10))} · USD. Raised = sales + Venus sales + match + Venus extras + prize + bonus. Page-reported figures, not verified payments or payouts. Underlying source freshness is unknown; this is not a live feed.</p></div>`;
  }
  const api = { SOURCE, parseLeaderboard, validate, apply, render };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ArtizenFinancials = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
