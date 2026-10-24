(function (root) {
  'use strict';

  function evidenceLinks(rows, escape) {
    return rows.length ? `<ul>${rows.map(row =>
      `<li><a href="${escape(row.url)}" target="_blank" rel="noopener noreferrer">${escape(row.label)}</a></li>`
    ).join('')}</ul>` : '<p>None recorded. This is not evidence that none exist.</p>';
  }

  function render(node, entities, associations, escape, model) {
    const d = node.agencyDetails;
    const e = escape;
    const links = rows => evidenceLinks(rows, e);
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

  function overview(entities, associations, escape, model) {
    const e = escape;
    const projects = Object.values(entities).filter(node => node.kind !== 'repository');
    const matches = associations.filter(edge => edge.type === 'capability-match');
    const open = node => `<button type="button" class="related-entity" data-related-node="${e(node.id)}">${e(node.name)}</button>`;
    const links = rows => evidenceLinks(rows, e);
    const offerFor = edge => entities[edge.source].agencyDetails.offers.find(item => item.id === edge.offer);
    const needFor = edge => entities[edge.target].agencyDetails.needs.find(item => item.id === edge.need);
    const active = projects.filter(node => ['now', 'next'].includes(node.agencyDetails.focus))
      .sort((a, b) => (a.agencyDetails.focus === b.agencyDetails.focus
        ? a.name.localeCompare(b.name) : a.agencyDetails.focus === 'now' ? -1 : 1));
    const groups = new Map();
    matches.forEach(edge => {
      const key = JSON.stringify([edge.source, edge.offer]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(edge);
    });
    const grouped = [...groups.values()].sort((a, b) =>
      entities[a[0].source].name.localeCompare(entities[b[0].source].name) ||
      offerFor(a[0]).label.localeCompare(offerFor(b[0]).label));
    return `<h2 class="details-title">Offers, needs &amp; candidate crossovers</h2>
      <p>Curated source inspection, not an exhaustive audit, live issue sync, proof of compatibility, or a ranking of project worth. Private/local findings are excluded pending steward approval.</p>
      <p>${projects.filter(node => node.agencyDetails.reviewNote).length} project review notes; ${projects.reduce((n, node) => n + (node.agencyDetails.offers?.length || 0), 0)} offers;
      ${projects.reduce((n, node) => n + (node.agencyDetails.needs?.length || 0), 0)} needs; ${matches.length} explicit candidate crossovers. Counts are coverage, not impact scores.</p>
      <section class="details-group"><h3>Before writing more code</h3>
        <p>Start with a focused need, inspect a possible donor, then run the named compatibility test before copying or rebuilding.
        Now / Next are steward-selected focus, not computed impact rankings. No candidate here is a verified integration.</p>
        <p>Repeated consumers below share one donor offer: investigate it once, then test each application's differences.
        Groups are alphabetical, not a recommendation to copy the busiest donor.</p>
        <p>Check current source, recent issues and unfinished branches before choosing reuse, adaptation, a shared component or new code.
        This public inventory is a dated discovery aid, not an automatic scan of private or local work.</p>
        <p><a href="https://github.com/TheJollyLaMa/DecentCanopy/blob/main/wiki/Reuse-First.md" target="_blank" rel="noopener noreferrer">Reuse-first build workflow and evidence checklist</a></p></section>
      <section class="details-group"><h3>Now / Next: needs and possible donors</h3>${active.length ? active.map(node =>
        `<details class="details-group agency-focus-project"><summary>${e(model.FOCUS[node.agencyDetails.focus])}: ${e(node.name)}</summary>
          ${open(node)}<p><strong>Next useful move:</strong> ${e(node.agencyDetails.nextAction)}</p>
          ${node.agencyDetails.needs?.length ? `<ul>${node.agencyDetails.needs.map(need => {
            const candidates = matches.filter(edge => edge.target === node.id && edge.need === need.id);
            return `<li><strong>${e(need.label)}</strong>
              <small>${e(model.CAPABILITY_STATES[need.state])}</small><p>${e(need.detail)}</p>
              ${candidates.length ? `<p>Possible donors (proposed only):</p><ul>${candidates.map(edge =>
                `<li>${open(entities[edge.source])}<span>${e(offerFor(edge).label)}</span></li>`).join('')}</ul>`
                : '<p>No evidence-linked donor recorded. Review existing work before deciding to build; this is not proof none exists.</p>'}
              ${links(need.evidence)}</li>`;
          }).join('')}</ul>` : '<p>No expressed needs established by this review; inspect current work before inventing a backlog.</p>'}
        </details>`).join('') : '<p>No Now / Next focus selected in this inventory. Candidate groups below remain available.</p>'}</section>
      <section class="details-group"><h3>Where existing work might meet a need</h3>
        <p>Expand a donor offer to compare its consumers, source evidence and next validation. Project counts are distinct consumers, not compatibility or impact scores.</p>
        ${grouped.length ? grouped.map(edges => {
          const source = entities[edges[0].source];
          const offer = offerFor(edges[0]);
          const consumers = new Set(edges.map(edge => edge.target)).size;
          return `<details class="details-group agency-reuse-group">
            <summary>${e(source.name)}: ${e(offer.label)} (${consumers} candidate ${consumers === 1 ? 'project' : 'projects'})</summary>
            ${open(source)}<small>${e(model.CAPABILITY_STATES[offer.state])}</small><p>${e(offer.detail)}</p>
            <p><strong>Donor evidence:</strong></p>${links(offer.evidence)}
            <ul>${edges.map(edge => {
              const need = needFor(edge);
              return `<li>${open(entities[edge.target])}
                <p><strong>Need:</strong> ${e(need.label)}</p>
                <small>${e(model.CAPABILITY_STATES[need.state])}</small><p>${e(need.detail)}</p>${links(need.evidence)}
                <p>${e(edge.note)}</p><p><strong>Next validation:</strong> ${e(edge.nextTest)}</p>${links(edge.evidence)}</li>`;
            }).join('')}</ul></details>`;
        }).join('') : '<p>No evidence-linked candidates recorded yet.</p>'}</section>
      <section class="details-group"><h3>Review coverage</h3><ul>${projects.sort((a, b) => a.name.localeCompare(b.name)).map(node => `<li>${open(node)}
        <small>${e(node.agencyDetails.reviewNote || 'Pending public review / unresolved identity')}</small></li>`).join('')}</ul></section>`;
  }

  const api = { render, overview };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CanopyAgencyMap = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
