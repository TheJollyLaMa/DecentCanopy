(function (root) {
  'use strict';
  const Model = typeof module !== 'undefined' && module.exports ? require('./public-source') : root.CanopyPublicSource;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const title = value => value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, char => char.toUpperCase());
  const link = item => `<a href="${escape(item.url)}" target="_blank" rel="noopener noreferrer">${escape(item.label)} ↗</a>`;
  const attributes = values => `<dl>${Object.entries(values || {}).map(([key, value]) => `<dt>${escape(title(key))}</dt><dd>${escape(value)}</dd>`).join('')}</dl>`;
  function render(snapshot, now = Date.now()) {
    Model.validateSnapshot(snapshot);
    const stale = snapshot.sources.some(source => source.observedAt && now - Date.parse(source.observedAt) > 15 * 60 * 1000);
    const sources = snapshot.sources.map(source => {
      const state = source.observedAt && now - Date.parse(source.observedAt) > 15 * 60 * 1000
        ? 'stale' : source.state;
      return `<details class="public-source-status"><summary>${escape(source.id)} · ${escape(state)}</summary>
        <p>${link({ url: source.url, label: 'Public source' })}</p>
        <p>Ready: ${escape(source.ready ?? 'Unknown (not supplied)')} · Source updated: ${escape(source.observedAt || 'Unknown')} · Last error: ${escape(source.lastError || 'None reported (not proof of completeness)')}</p>
        <p>Scan start: ${escape(source.coverage.fromBlock ?? 'Unknown')} · Scan through: ${escape(source.coverage.throughBlock ?? 'Unknown')} · Coverage: ${escape(source.coverage.state)} (completeness not independently checked).</p>
        ${attributes(source.attributes)}</details>`;
    }).join('');
    const funds = snapshot.records.filter(record => record.kind === 'fund').map(fund => {
      const amounts = Object.entries(fund.amounts || {}).map(([key, value]) =>
        `<li>${escape(title(key))}: ${value === null ? 'Unavailable' : `${escape(Model.formatUnits(value, fund.asset.decimals))} ${escape(fund.asset.symbol)} · ${escape(value)} integer units`}</li>`).join('');
      return `<details class="public-source-fund"><summary>${escape(fund.label)} · ${escape(fund.attributes?.slug || fund.id)}</summary>
        <p>Source-reported · ${escape(fund.source.observedAt)} · ${escape(now - Date.parse(fund.source.observedAt) > 15 * 60 * 1000 ? 'stale' : fund.coverage.state)} coverage</p>
        <ul>${amounts}</ul>${attributes(fund.attributes)}</details>`;
    }).join('');
    const events = snapshot.records.filter(record => record.kind === 'interaction');
    const eventsHTML = events.length ? events.slice(0, 25).map(event => `<li>
      <strong>${escape(event.label)}</strong> · ${escape(event.attributes?.fundSlug || '')}
      <p>${Object.entries(event.amounts || {}).map(([key, value]) => value === null ? `${escape(key)}: Unavailable`
        : `${escape(Model.formatUnits(value, event.asset.decimals))} ${escape(event.asset.symbol)} (${escape(value)} integer units)`).join(' · ')}</p>
      <p>Observed at source: ${escape(event.source.observedAt)} · Event time: ${escape(event.attributes?.paidAt || 'Unknown')} · Evidence state: ${escape(event.source.verification)} · Source verification claim: ${escape(event.attributes?.sourceVerification || 'Unavailable')}</p>
      <p>${event.source.limitations.map(escape).join(' ')}</p>${(event.evidence || []).map(link).join(' ')}
    </li>`).join('') : '<li>Payout records unavailable or no matching records in this source coverage. This is not evidence of zero payouts.</li>';
    return `<p><strong>Public source status: ${escape(snapshot.state)}${stale ? ' · stale source data' : ''}</strong> · Requested ${escape(snapshot.observedAt)}.
      Read-only, source-reported data; not a balance audit, ownership proof, or payout verification.</p>
      <ul>${snapshot.issues.map(issue => `<li>${escape(issue)}</li>`).join('')}</ul>
      <button type="button" data-public-source-refresh>Refresh public sources</button>
      <div class="public-source-statuses">${sources}</div>
      ${funds || '<p>Fund data unavailable. Unknown amounts are not zero.</p>'}
      <details><summary>Router payroll evidence · ${events.length} source records (not a lifetime total)</summary>
        ${events.length > 25 ? '<p>Showing the first 25 records only; follow public source links for the complete response.</p>' : ''}<ul>${eventsHTML}</ul></details>`;
  }
  function createUI(adapters) {
    adapters.forEach(Model.assertAdapter);
    const cleanups = new WeakMap();
    function mount(container, node) {
      if (container) cleanups.get(container)?.();
      container?.querySelector('[data-public-sources]')?.remove();
      if (!container || !node || node.creatorDraft) return;
      const providers = adapters.filter(adapter => adapter.descriptor.projectRefs.includes(node.id));
      if (!providers.length) return;
      const section = root.document.createElement('details');
      section.className = 'details-group public-sources';
      section.setAttribute('data-public-sources', '');
      const summary = root.document.createElement('summary');
      summary.textContent = 'Public funds & router payroll · source status';
      section.append(summary);
      const body = root.document.createElement('div');
      body.setAttribute('aria-live', 'polite');
      body.textContent = 'Expand to request public sources. No wallet, cookies or creator drafts are sent. Amounts may be unavailable; source evidence is not independent verification.';
      section.append(body);
      container.append(section);
      let pending = false, snapshots = null, timer = null;
      let paintedSnapshots = null, paintedAge = '';
      cleanups.set(container, () => clearTimeout(timer));
      function paint() {
        if (!section.isConnected) return;
        const age = snapshots.flatMap(snapshot => snapshot.sources.map(source =>
          Boolean(source.observedAt && Date.now() - Date.parse(source.observedAt) > 15 * 60 * 1000))).join(',');
        if (paintedSnapshots !== snapshots || paintedAge !== age) {
          const disclosures = Array.from(body.querySelectorAll('details'), disclosure => disclosure.open);
          body.innerHTML = snapshots.map(snapshot => render(snapshot)).join('');
          if (paintedSnapshots === snapshots) {
            body.querySelectorAll('details').forEach((disclosure, index) => { disclosure.open = disclosures[index]; });
          }
          paintedSnapshots = snapshots;
          paintedAge = age;
        }
        clearTimeout(timer);
        if (section.open) timer = setTimeout(paint, 60000);
      }
      async function load() {
        if (pending) return;
        pending = true;
        snapshots = null;
        paintedSnapshots = null;
        clearTimeout(timer);
        body.textContent = 'Loading public sources… Current balances and verification are unavailable until validated.';
        try {
          snapshots = await Promise.all(providers.map(async adapter => {
            const snapshot = Model.validateSnapshot(await adapter.getSnapshot());
            Model.requireValue(snapshot.providerId === adapter.descriptor.id, 'Unexpected snapshot provider');
            return snapshot;
          }));
          paint();
        } catch {
          if (section.isConnected) body.innerHTML = '<p>Public source unavailable. No balances or success inferred.</p><button type="button" data-public-source-refresh>Retry public sources</button>';
        } finally { pending = false; }
      }
      section.addEventListener('toggle', () => {
        clearTimeout(timer);
        if (section.open) { if (snapshots) paint(); else load(); }
      });
      section.addEventListener('click', event => {
        if (event.target.closest('[data-public-source-refresh]')) { event.preventDefault(); load(); }
      });
    }
    return { mount };
  }
  const api = { render, createUI };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.CanopyPublicSourceUI = { ...api, ...createUI([root.CanopyBuskingPublicSource.createAdapter()]) };
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
