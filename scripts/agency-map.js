(function (root) {
  'use strict';

  function render(node, entities, associations, escape, model) {
    const d = node.agencyDetails;
    const e = escape;
    const links = rows => rows.length ? `<ul>${rows.map(row =>
      `<li><a href="${e(row.url)}" target="_blank" rel="noopener noreferrer">${e(row.label)}</a></li>`
    ).join('')}</ul>` : '<p>None recorded. This is not evidence that none exist.</p>';
    const connections = associations.filter(edge => edge.source === node.id || edge.target === node.id);
    return `<p class="details-track">${e(node.kind)} · Focus: ${e(model.FOCUS[d.focus])}</p>
      <h2 class="details-title">${e(node.name)}</h2>
      <p class="data-provenance">${e(node.sourceLabel)} · Reviewed ${e(d.reviewedAt)}</p>
      <p class="details-desc">${e(node.description)}</p>
      <section class="details-group"><h3>Current understanding</h3><p>${e(d.currentState)}</p>
        <p>${e(d.repositoryNote)}</p>
        <p>Funding balances and payout status: unavailable in this map. Linked issues are a dated backlog, not evidence of completed work.</p></section>
      <section class="details-group"><h3>Next useful move · ${e(model.FOCUS[d.focus])}</h3><p>${e(d.nextAction)}</p></section>
      <section class="details-group"><h3>Sources &amp; existing work</h3>${links(d.evidence)}</section>
      <section class="details-group"><h3>Connections (${connections.length})</h3><ul>${connections.map(edge => {
        const otherId = edge.source === node.id ? edge.target : edge.source;
        const other = entities[otherId];
        const direction = edge.source === node.id ? 'Outgoing to' : 'Incoming from';
        return `<li><button type="button" class="related-entity" data-related-node="${e(otherId)}">
          <strong>${e(direction)} ${e(other.name)}</strong>
          <small>${e(model.TYPES[edge.type])} · ${e(model.STATES[edge.relationshipState].label)}</small></button>
          <p>${e(edge.note)}</p>${links(edge.evidence)}</li>`;
      }).join('')}</ul></section>
      <p class="details-muted">This is a curated public discovery map, not GitHub authorization, proof of ownership, a shared treasury, or a promise of rewards. Proposed reuse must be adapted and tested in each dapp's context. Do not publish private health data or credentials.</p>`;
  }

  const api = { render };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CanopyAgencyMap = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
