(function (root) {
  'use strict';
  const SOURCE = 'https://artizen.fyi/projects?season=7';
  const COLUMNS = ['Sales', 'Venus sales', 'S+VS', 'Match', 'S+VS+M', 'Venus extras', 'Prize', 'Bonus', 'Raised', 'V/S', 'M/S', 'P/S', 'B/S', 'R/S'];
  const FIELDS = ['sales', 'venusSales', 'salesWithVenus', 'match', 'salesWithMatch', 'venusExtras', 'prize', 'bonus', 'raised'];
  const CURATED_REFERENCES = {
    'decent-project:0x807061df657a7697c04045da7d16d941861caabc:b5053fb2-dfa8-4716-a53f-d7c8376daf6b': 'artizen-project:1785910387246x805847173637603300',
    'decent-project:0x807061df657a7697c04045da7d16d941861caabc:606f2aed-eb5b-40bb-841f-1abadca8f811': 'curated-project:qart-code'
  };
  function plainText(value) {
    const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ' };
    return value.replace(/<[^>]*>/g, '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
      if (Object.hasOwn(entities, entity)) return entities[entity];
      if (entity.startsWith('#')) {
        const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
        if (code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)) return String.fromCodePoint(code);
        throw new Error('Invalid character in leaderboard project details.');
      }
      throw new Error(`Unsupported HTML entity ${match} in leaderboard project details.`);
    }).trim();
  }
  function parseLeaderboard(html, identities = new Map(), season = 7) {
    if (!Number.isInteger(season) || season < 0 || season > 7) throw new Error('Unsupported Artizen season.');
    const table = /<table\b[^>]*id="artizen-projects-table"[^>]*>([\s\S]*?)<\/table>/.exec(html)?.[1];
    if (!table || !html.includes(`<option value="${season}" selected>`)) throw new Error(`Expected the public Season ${season} project leaderboard.`);
    const headers = [...table.matchAll(/<th\b[^>]*>([^<]*)<\/th>/g)].map(m => m[1]);
    const columns = season === 7 ? COLUMNS : COLUMNS.filter(c => !['Bonus', 'B/S'].includes(c));
    const fields = season === 7 ? FIELDS : FIELDS.filter(f => f !== 'bonus');
    if (JSON.stringify(headers) !== JSON.stringify(['Project', ...columns])) throw new Error('Leaderboard columns changed; refusing ambiguous financial data.');
    const result = new Map();
    for (const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
      const cells = [...row[1].matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/g)];
      if (!cells.length) continue;
      if (cells.length !== columns.length + 1) throw new Error('Unexpected leaderboard row shape.');
      const slug = decodeURIComponent(/href="\/projects\/([^"?]+)"/.exec(cells[0][2])?.[1] || '');
      if (!slug || result.has(slug)) throw new Error('Missing or duplicate project identity in leaderboard.');
      const name = plainText(/<a\b[^>]*>([\s\S]*?)<\/a>/.exec(cells[0][2])?.[1] || '');
      if (!name) throw new Error('Missing leaderboard project name.');
      identities.set(slug, { name, description: plainText(/<small\b[^>]*>([\s\S]*?)<\/small>/.exec(cells[0][2])?.[1] || '') });
      const values = cells.slice(1, fields.length + 1).map(cell => {
        const raw = /\bdata-order="([^"]*)"/.exec(cell[1])?.[1];
        if (!raw || !/^\d+(?:\.\d+)?$/.test(raw) || !Number.isFinite(Number(raw))) throw new Error(`Invalid financial value for ${slug}.`);
        return Number(raw);
      });
      const metrics = Object.fromEntries(fields.map((field, i) => [field, values[i]]));
      if (season !== 7) metrics.bonus = null;
      const expected = metrics.sales + metrics.venusSales + metrics.match + metrics.venusExtras + metrics.prize + (metrics.bonus ?? 0);
      if (Math.abs(expected - metrics.raised) > .01) throw new Error(`Raised breakdown does not reconcile for ${slug}.`);
      if (Math.abs(metrics.sales + metrics.venusSales - metrics.salesWithVenus) > .01
        || Math.abs(metrics.salesWithVenus + metrics.match - metrics.salesWithMatch) > .01) throw new Error(`Sales breakdown does not reconcile for ${slug}.`);
      result.set(slug, metrics);
    }
    if (!result.size && !/<tbody>\s*<\/tbody>/.test(table)) throw new Error('Leaderboard contains no usable project rows.');
    return result;
  }
  function validate(data) {
    if (data?.format !== 'decentcanopy-artizen-financial-captures' || data.version !== 1
      || !Number.isInteger(data.season) || data.season < 0 || data.season > 7 || data.source !== `https://artizen.fyi/projects?season=${data.season}`
      || !Number.isFinite(Date.parse(data.capturedAt)) || !Array.isArray(data.projects)) throw new Error('Invalid supplementary financial capture.');
    const ids = new Set();
    for (const p of data.projects) {
      if (typeof p.id !== 'string' || !/^(artizen-project|curated-project|artizen-supplement):[^\s]+$/.test(p.id) || ids.has(p.id) || !p.slug) throw new Error('Invalid or duplicate financial project identity.');
      ids.add(p.id);
      if (p.id.startsWith('artizen-supplement:') && (p.id !== `artizen-supplement:${p.slug}` || !p.name)) throw new Error('Invalid supplemental leaderboard project.');
      if (!['captured', 'not-in-season-leaderboard'].includes(p.status)) throw new Error('Invalid capture status.');
      if (p.status !== 'captured') {
        if (p.metrics !== null) throw new Error('Missing project totals must be unknown, not zero.');
        continue;
      }
      if (!p.metrics || FIELDS.some(field => field === 'bonus' && data.season !== 7 && p.metrics[field] === null ? false
        : typeof p.metrics[field] !== 'number' || !Number.isFinite(p.metrics[field]) || p.metrics[field] < 0)) throw new Error('Invalid captured financial numbers.');
      const m = p.metrics;
      if (Math.abs(m.sales + m.venusSales + m.match + m.venusExtras + m.prize + (m.bonus ?? 0) - m.raised) > .01
        || Math.abs(m.sales + m.venusSales - m.salesWithVenus) > .01
        || Math.abs(m.salesWithVenus + m.match - m.salesWithMatch) > .01) throw new Error('Captured financial breakdown does not reconcile.');
    }
    return data;
  }
  function applyComprehensive(graph, data) {
    if (data?.format !== 'decentcanopy-artizen-comprehensive-capture' || data.version !== 1
      || data.seasons?.length !== 8 || data.seasons.some((s, i) => s.season !== i)) throw new Error('Invalid all-seasons financial capture.');
    data.seasons.forEach(validate);
    let result = { ...graph, projects: graph.projects.map(p => ({ ...p, financialCaptures: [] })) };
    for (const season of data.seasons) {
      const ids = new Set(season.projects.map(p => p.id));
      result = apply(result, season);
      result = { ...result, projects: result.projects.map(p => {
        const capture = p.financialCapture;
        if (!capture || !ids.has(capture.id) || capture.season !== season.season) return p;
        return { ...p, financialCaptures: [...(p.financialCaptures || []), capture] };
      }) };
    }
    return result;
  }
  function renderHistory(captures, escape, currency) {
    if (!captures?.length) return '';
    return '<div class="details-group"><h3>Public Artizen financial history</h3><p class="details-muted">Separate season tables, not a verified lifetime total. Missing seasons are unknown; no amounts are inferred or added across seasons. <a href="data/artizen-comprehensive-capture.json" target="_blank" rel="noopener noreferrer">Source metadata and coverage report ↗</a></p>'
      + captures.slice().reverse().map(c => `<details${c.season === 7 ? ' open' : ''}><summary>Season ${c.season} · ${c.status === 'captured' ? `${currency(c.metrics.raised)} reported raised` : 'not listed'}</summary>${render(c, escape, currency)}</details>`).join('') + '</div>';
  }
  function apply(graph, data) {
    validate(data);
    const rows = new Map(data.projects.map(p => [p.id, p]));
    const existing = new Set(graph.projects.map(p => p.id));
    const projects = graph.projects.concat(data.projects.filter(p => p.id.startsWith('artizen-supplement:') && !existing.has(p.id)).map(p => ({
      id: p.id, slug: p.slug, name: p.name, description: p.description || '', kind: 'project', track: 'Projects',
      status: 'not-reported', raised: 0, goal: 0, season: data.season,
      sourceLabel: 'Supplemental artizen.fyi leaderboard project · not in frozen archive',
      generatedAt: data.capturedAt, artizenUrl: data.source,
      artizenPageUrl: `https://artizen.fund/index/p/${encodeURIComponent(p.slug)}`
    })));
    const nodes = new Map(projects.map(p => [p.id, p]));
    return { ...graph, projects: projects.map(node => {
      const signedReference = node.creatorRecord?.projects.find(p => p.key === node.creatorProjectKey)?.archiveId;
      const reference = signedReference || (node.creatorRecord ? CURATED_REFERENCES[node.id] : null);
      const archive = reference ? nodes.get(reference) : node;
      const row = archive && rows.get(archive.id);
      if (!row || row.slug !== archive.slug) return node;
      return { ...node, financialCapture: { ...row, capturedAt: data.capturedAt, source: data.source, season: data.season,
        ...(reference ? { historicalReference: reference, referenceKind: signedReference ? 'creator-reported' : 'locally-curated' } : {}) } };
    }) };
  }
  function render(capture, escape, currency) {
    if (!capture) return '';
    const source = `<a href="${escape(capture.source)}" target="_blank" rel="noopener noreferrer">artizen.fyi Season ${capture.season} leaderboard ↗</a>`;
    const reference = capture.historicalReference ? `<p class="details-muted">Figures for ${escape(capture.name)}, linked by ${capture.referenceKind === 'locally-curated' ? 'a locally curated historical association' : 'the creator’s self-reported historical reference'}; not verified project ownership.</p>` : '';
    if (capture.status !== 'captured') return `<div class="details-group"><h3>Supplementary financial check</h3>${reference}<p>Not listed in the checked Season ${capture.season} leaderboard. Amount unknown, not $0.</p><small>${source} · checked ${escape(capture.capturedAt.slice(0, 10))}</small></div>`;
    const m = capture.metrics;
    return `<div class="details-funding"><h3>Separate Season ${capture.season} financial capture</h3>${reference}<strong>${currency(m.raised)} reported raised</strong>
      <dl>${[['Sales (excluding Venus)', m.sales], ['Venus sales', m.venusSales], ['Match', m.match], ['Venus extras', m.venusExtras], ['Prize', m.prize], ['Bonus', m.bonus]].map(([label, amount]) => `<dt>${label}</dt><dd>${amount === null ? 'Not supplied by this table' : currency(amount)}</dd>`).join('')}</dl>
      <p class="participation-card-note">${source} · captured ${escape(capture.capturedAt.slice(0, 10))} · USD. Raised = sales + Venus sales + match + Venus extras + prize${m.bonus === null ? '; this table has no bonus column' : ' + bonus'}. Page-reported figures, not verified payments or payouts. Underlying source freshness is unknown; this is not a live feed.</p></div>`;
  }
  const api = { SOURCE, parseLeaderboard, validate, apply, applyComprehensive, render, renderHistory };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ArtizenFinancials = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
