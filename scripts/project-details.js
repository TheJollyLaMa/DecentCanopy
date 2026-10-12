(function (root) {
  'use strict';
  function render(node, escape) {
    const d = node?.projectDetails;
    if (!d) return '';
    const e = escape;
    const link = (url, label) => {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return '';
        return `<a href="${e(parsed.href)}" target="_blank" rel="noopener noreferrer">${e(label)} ↗</a>`;
      } catch { return ''; }
    };
    const amount = value => typeof value === 'number' ? e(value) : 'Unavailable';
    const accounting = d.accountingLedger;
    const treasury = d.treasury;
    const history = accounting?.role === 'accounting-only' && accounting.chainId === 10
      && /^0x[0-9a-fA-F]{40}$/.test(accounting.address)
      ? `<p>Optimism (chain ID 10): accounting/history only. <strong>Do not deposit funds to this address.</strong></p>
        <p>${link(`https://optimistic.etherscan.io/address/${accounting.address}`, 'Accounting ledger · history only')}</p><code>${e(accounting.address)}</code>`
      : '';
    const deployed = treasury?.status === 'deployed-tested'
      && treasury.chainId === 8453
      && /^0x[0-9a-fA-F]{40}$/.test(treasury.address)
      ? `<p>${e(treasury.contract)} is deployed on Base (chain ID ${e(treasury.chainId)}):
        <strong>deposit on Base only</strong> at <code>${e(treasury.address)}</code>.</p>
        <p>${link(treasury.explorerUrl, 'BaseScan contract')}${link(treasury.url, 'Treasury page')}</p>
        <p>Assets: ${e(treasury.assets.join(' + '))}. Passed checks: ${e(treasury.tests.join('; '))}. ${e(treasury.payoutAuthority)}.</p>
        <p>Owner: <code>${e(treasury.owner)}</code>. Test transactions do not establish a current balance; balances and funding totals are unavailable.</p>`
      : '';
    return `<section class="details-group project-details"><h3>Project status &amp; public accountability</h3>
      <p class="data-provenance">${e(d.sourceLabel)}</p><p>${e(d.summary)}</p>
      <p><strong>Stage: ${e(d.stage)}</strong></p>
      <p>Current funding total: ${amount(d.raised)} · Funding goal: ${amount(d.goal)}</p>
      <p>Location: ${e(d.location || 'Unavailable')} · Outcomes: ${e(d.outcomes || 'Unavailable')}</p>
      <div class="details-links">${link(d.repoUrl, 'Repository')}${link(d.ledgerUrl, 'Live public ledger')}${link(d.campaignUrl, 'Artizen campaign')}</div>
      ${history}${deployed}
      <p class="details-muted">Historical Artizen captures are not current treasury balances, funding goals, or evidence of payouts.</p></section>`;
  }
  const api = { render };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CanopyProjectDetails = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
