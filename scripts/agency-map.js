(function (root) {
  'use strict';

  function render(node, entities, associations, escape, model) {
    const d = node.agencyDetails;
    const e = escape;
    const links = rows => rows.length ? `<ul>${rows.map(row =>
      `<li><a href="${e(row.url)}" target="_blank" rel="noopener noreferrer">${e(row.label)}</a></li>`
    ).join('')}</ul>` : '<p>None recorded. This is not evidence that none exist.</p>';
    const connections = associations.filter(edge => edge.source === node.id || edge.target === node.id);
    const capabilities = (field, title) => `<details class="details-group"><summary>${title} (${d[field]?.length || 0})</summary>${
      d[field]?.length ? `<ul>${d[field].map(item => `<li><strong>${e(item.label)}</strong>
        <small>${e(model.CAPABILITY_STATES[item.state])}</small><p>${e(item.detail)}</p>${links(item.evidence)}</li>`).join('')}</ul>`
        : '<p>Not established by this review. This does not mean the project has nothing to offer or needs no help.</p>'
    }</details>`;
    return `<p class="details-track">${e(node.kind)} · Focus: ${e(model.FOCUS[d.focus])}</p>
      <h2 class="details-title">${e(node.name)}</h2>
      <p class="data-provenance">Curated project map · Reviewed ${e(d.reviewedAt)}</p>
      <p class="details-desc">${e(node.description)}</p>
      <details class="details-group"><summary>Current understanding &amp; limits</summary><p>${e(d.currentState)}</p>
        <p>${e(d.repositoryNote)}</p>
        <p>Funding balances and payout status: unavailable in this map. Linked issues are a dated backlog, not evidence of completed work.</p>
        <p>${e(node.sourceLabel)}</p>
        <p>${e(d.reviewNote || 'Capability review pending or public identity unresolved. No private/local findings are published here.')}</p>
        ${d.reviewCaveats?.length ? `<ul>${d.reviewCaveats.map(note => `<li>${e(note)}</li>`).join('')}</ul>` : ''}
      </details>
      <section class="details-group"><h3>Next useful move · ${e(model.FOCUS[d.focus])}</h3><p>${e(d.nextAction)}</p></section>
      ${capabilities('offers', 'Code / patterns to offer')}
      ${capabilities('needs', 'Expressed needs')}
      <details class="details-group"><summary>Sources &amp; existing work</summary>${links(d.evidence)}</details>
      <details class="details-group"><summary>Connections (${connections.length})</summary><ul>${connections.map(edge => {
        const otherId = edge.source === node.id ? edge.target : edge.source;
        const other = entities[otherId];
        const direction = edge.source === node.id ? 'Outgoing to' : 'Incoming from';
        return `<li><button type="button" class="related-entity" data-related-node="${e(otherId)}">
          <strong>${e(direction)} ${e(other.name)}</strong>
          </button><details><summary>${e(model.TYPES[edge.type])} · ${e(model.STATES[edge.relationshipState].label)}</summary>
          <p>${e(edge.note)}</p>${edge.type === 'capability-match' ? `<p><strong>Offer:</strong> ${e(entities[edge.source].agencyDetails.offers.find(item => item.id === edge.offer).label)}
            <br><strong>Need:</strong> ${e(entities[edge.target].agencyDetails.needs.find(item => item.id === edge.need).label)}</p>
            <p><strong>Next validation:</strong> ${e(edge.nextTest)}</p>` : ''}${links(edge.evidence)}</details></li>`;
      }).join('')}</ul></details>
      <p class="details-muted">This is a curated public discovery map, not GitHub authorization, proof of ownership, a shared treasury, or a promise of rewards. Proposed reuse must be adapted and tested in each dapp's context. Do not publish private health data or credentials.</p>`;
  }

  function overview(entities, associations, escape) {
    const e = escape;
    const projects = Object.values(entities).filter(node => node.kind !== 'repository');
    const matches = associations.filter(edge => edge.type === 'capability-match');
    const open = node => `<button type="button" class="related-entity" data-related-node="${e(node.id)}">${e(node.name)}</button>`;
    return `<h2 class="details-title">Offers, needs &amp; candidate crossovers</h2>
      <p>Curated source inspection, not an exhaustive audit, live issue sync, proof of compatibility, or a ranking of project worth. Private/local findings are excluded pending steward approval.</p>
      <p>${projects.filter(node => node.agencyDetails.reviewNote).length} project review notes; ${projects.reduce((n, node) => n + (node.agencyDetails.offers?.length || 0), 0)} offers;
      ${projects.reduce((n, node) => n + (node.agencyDetails.needs?.length || 0), 0)} needs; ${matches.length} explicit candidate crossovers. Counts are coverage, not impact scores.</p>
      <section class="details-group"><h3>Where existing work might meet a need</h3>${matches.length ? `<ul>${matches.map(edge => `<li>
        ${open(entities[edge.source])}<span>could help</span>${open(entities[edge.target])}
        <p>${e(edge.note)}</p><p><strong>Next validation:</strong> ${e(edge.nextTest)}</p></li>`).join('')}</ul>` : '<p>No evidence-linked candidates recorded yet.</p>'}</section>
      <section class="details-group"><h3>Review coverage</h3><ul>${projects.sort((a, b) => a.name.localeCompare(b.name)).map(node => `<li>${open(node)}
        <small>${e(node.agencyDetails.reviewNote || 'Pending public review / unresolved identity')}</small></li>`).join('')}</ul></section>`;
  }

  const api = { render, overview };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CanopyAgencyMap = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
