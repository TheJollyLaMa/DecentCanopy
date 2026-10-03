/*
 * Creator "Artizen account" panel. Artizen sign-in is not available yet, so the login form is
 * rendered disabled. Everything shown is derived from the public graph snapshot, curated links,
 * or browser-local participant reports — never from Artizen account access.
 */
(function (root) {
  'use strict';

  const PROJECT_LINKS = ['creator-associated', 'collaboration'];
  const FUND_RELATIONS = ['submitted', 'curated', 'funded'];
  const SUPPORT_LINKS = { boosted: 'boosted', 'collected-artifacts': 'collected artifacts' };

  function sameAddress(a, b) {
    return Boolean(a && b && String(a).toLowerCase() === String(b).toLowerCase());
  }

  function walletStatus(creator, connected) {
    const declared = creator.publicWallet || null;
    if (!declared) return { state: connected ? 'none-declared-connected' : 'none-declared', declared, connected };
    if (!connected) return { state: 'declared-not-connected', declared, connected };
    if (!sameAddress(declared.address, connected.address)) return { state: 'declared-differs', declared, connected };
    return {
      state: Number(connected.chainId) === Number(declared.chainId) ? 'declared-matches' : 'declared-matches-other-network',
      declared, connected,
    };
  }

  function summarize(creator, associations, entitiesById, connectedWallet) {
    const other = (edge, id) => (edge.source === id ? edge.target : edge.target === id ? edge.source : null);
    const kindOf = id => entitiesById[id]?.kind;
    const projects = new Map();
    const funds = new Map();
    const stewarded = new Map();
    const boosted = new Map();
    const supported = new Map();
    const collected = new Map();

    function fundEntry(fundId) {
      if (!funds.has(fundId)) funds.set(fundId, { fund: entitiesById[fundId], relations: new Set(), via: new Set(), reported: false, memberSource: null });
      return funds.get(fundId);
    }

    associations.forEach(edge => {
      const peer = other(edge, creator.id);
      if (!peer || !entitiesById[peer]) return;
      if (kindOf(peer) === 'project' && PROJECT_LINKS.includes(edge.type)) {
        projects.set(peer, { project: entitiesById[peer], relation: edge.type, through: null });
      } else if (kindOf(peer) === 'fund' && edge.type === 'fund-member') {
        const entry = fundEntry(peer);
        entry.reported = true;
        entry.memberSource = edge.sourceLabel || 'Participant-reported';
      } else if (SUPPORT_LINKS[edge.type] && edge.source === creator.id) {
        const entry = { entity: entitiesById[peer], sourceLabel: edge.sourceLabel || 'Participant-reported' };
        if (edge.type === 'boosted') boosted.set(peer, entry);
        else collected.set(peer, entry);
        if (!supported.has(peer)) supported.set(peer, { entity: entitiesById[peer], ways: new Set(), sourceLabel: entry.sourceLabel, note: null });
        supported.get(peer).ways.add(SUPPORT_LINKS[edge.type]);
      } else if (kindOf(peer) === 'fund' && edge.type === 'fund-steward' && edge.source === creator.id) {
        stewarded.set(peer, { fund: entitiesById[peer], sourceLabel: edge.sourceLabel || 'Participant-reported' });
      }
    });

    // Supporting a project (boosts, artifacts) never makes it the creator's own project.
    projects.forEach((_, id) => supported.delete(id));

    [...projects.values()].forEach(({ project }) => {
      associations.forEach(edge => {
        const peer = other(edge, project.id);
        if (!peer || kindOf(peer) !== 'fund') return;
        if (!FUND_RELATIONS.includes(edge.type) && edge.type !== 'fund-member') return;
        const entry = fundEntry(peer);
        entry.relations.add(edge.type === 'fund-member' ? 'reported member' : edge.type);
        entry.via.add(project.name);
      });
    });

    const placed = entity => ({ entity, location: entity.sharedLocation || null });
    return {
      wallet: walletStatus(creator, connectedWallet),
      projects: [...projects.values()].sort((a, b) => a.project.name.localeCompare(b.project.name)),
      funds: [...funds.values()].filter(entry => entry.fund)
        .map(entry => ({ ...entry, relations: [...entry.relations], via: [...entry.via] }))
        .sort((a, b) => a.fund.name.localeCompare(b.fund.name)),
      boosted: [...boosted.values()],
      collected: [...collected.values()],
      supported: [...supported.values()].map(entry => ({ ...entry, ways: [...entry.ways] }))
        .sort((a, b) => a.entity.name.localeCompare(b.entity.name)),
      totals: projectTotals([...projects.values()].map(entry => entry.project)),
      stewarded: [...stewarded.values()].sort((a, b) => a.fund.name.localeCompare(b.fund.name)),
      locations: {
        creator: creator.sharedLocation || null,
        projects: [...projects.values()].map(({ project }) => placed(project)),
        funds: [...funds.values()].filter(entry => entry.fund).map(entry => placed(entry.fund)),
      },
    };
  }

  function projectTotals(projects) {
    const withStats = projects.filter(project => project.publicStats && typeof project.publicStats.total === 'number');
    return {
      count: withStats.length,
      total: withStats.reduce((sum, project) => sum + project.publicStats.total, 0),
      boosts: withStats.reduce((sum, project) => sum + (project.publicStats.boosts || 0), 0),
      capturedAt: withStats.map(project => project.publicStats.capturedAt).filter(Boolean).sort().pop() || null,
    };
  }

  const usd = value => `$${Math.round(value).toLocaleString('en-US')}`;

  const WALLET_MESSAGES = {
    'none-declared': ['unknown', 'No public wallet is linked to this creator in DecentCanopy yet.', 'Use “Edit website / wallet / location” to link your public Artizen wallet address.'],
    'none-declared-connected': ['unknown', 'No public wallet is linked to this creator in DecentCanopy yet.', 'Your connected wallet can be filled in with “Edit website / wallet / location”.'],
    'declared-not-connected': ['known', 'A public wallet is linked to this creator in DecentCanopy.', 'Connect your wallet in the header to check whether it matches.'],
    'declared-differs': ['differs', 'Your connected wallet does not match the wallet linked to this creator.', 'This may be someone else’s canopy, or you may use a different wallet on Artizen.'],
    'declared-matches': ['matches', 'Your connected wallet matches the wallet linked to this creator.', 'A match is a helpful hint, not proof that this Artizen account is yours.'],
    'declared-matches-other-network': ['matches', 'Your connected address matches, on a different network.', 'The link was declared for another network; addresses match but the network differs.'],
  };

  function renderCreator(creator, context) {
    const { associations, entitiesById, connectedWallet, networks, esc, viewerId } = context;
    const isViewer = Boolean(viewerId && viewerId === creator.id);
    const summary = summarize(creator, associations, entitiesById, connectedWallet);
    const [tone, headline, hint] = WALLET_MESSAGES[summary.wallet.state];
    const declared = summary.wallet.declared;
    const network = declared && networks[declared.chainId];
    const short = address => `${address.slice(0, 6)}…${address.slice(-4)}`;
    const thumb = entity => entity.image
      ? `<img class="account-thumb" src="${esc(entity.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" />` : '';
    const entityButton = (entity, detail) =>
      `<li><button type="button" class="related-entity${entity.image ? ' related-entity--thumb' : ''}" data-related-node="${esc(entity.id)}">${thumb(entity)}<span><strong>${esc(entity.name)}</strong>${detail ? `<small>${esc(detail)}</small>` : ''}</span></button></li>`;
    const locationText = location => location
      ? `${esc(location.label)} · ${esc(location.precision)}`
      : '<span class="account-muted">not shared</span>';
    const relationLabel = { 'creator-associated': 'Creator-curated link', collaboration: 'Reported collaboration' };

    const projectsHtml = summary.projects.length
      ? `<ul>${summary.projects.map(({ project, relation }) => entityButton(project, [
        project.publicStats ? `${usd(project.publicStats.total)} total` : null,
        relationLabel[relation],
      ].filter(Boolean).join(' · '))).join('')}</ul>${summary.totals.count
        ? `<p class="account-total"><strong>${usd(summary.totals.total)}</strong> across ${summary.totals.count} linked project pages · ${summary.totals.boosts.toLocaleString()} project boosts</p><p class="account-muted">Artizen public project pages, captured ${esc(summary.totals.capturedAt)} · not live.</p>` : ''}`
      : '<p class="account-muted">No projects are linked to this creator yet.</p>';
    const viaFunds = summary.funds.filter(entry => entry.via.length);
    const relationText = { submitted: 'submitted', curated: 'curated', funded: 'funded' };
    const fundsHtml = viaFunds.length
      ? `<ul>${viaFunds.slice(0, 12).map(entry => entityButton(entry.fund, [
        entry.relations.filter(relation => relationText[relation]).map(relation => relationText[relation]).join(', ') || null,
        entry.via.length ? `via ${entry.via.join(', ')}` : null,
      ].filter(Boolean).join(' · '))).join('')}</ul>${viaFunds.length > 12 ? `<p class="account-muted">Showing 12 of ${viaFunds.length} funds.</p>` : ''}`
      : '<p class="account-muted">No fund submissions recorded for this creator’s projects.</p>';
    const supportHtml = summary.supported.length
      ? `<ul>${summary.supported.map(entry => entityButton(entry.entity, [
        entry.entity.publicStats ? `${usd(entry.entity.publicStats.total)} total` : null,
        entry.ways.join(' + '),
        entry.sourceLabel,
      ].filter(Boolean).join(' · '))).join('')}</ul><p class="account-muted">Supporting a project is not ownership; these stay someone else’s projects.</p>`
      : '<p class="account-muted">No supported projects recorded yet.</p>';
    const collectedHtml = summary.collected.length
      ? `<ul>${summary.collected.map(entry => entityButton(entry.entity, `${entry.sourceLabel} · unverified`)).join('')}</ul>
        <p class="account-muted">Self-declared for now. A full, verified collection needs Artizen sign-in or ledger receipts.</p>`
      : '<p class="account-muted">Collected artifacts need Artizen sign-in or verified ledger receipts; the public feed has no purchase records.</p>';
    const profile = creator.artizenProfile || null;
    const profileHtml = profile ? `<div class="details-group account-group account-profile">
        <h4>Public Artizen profile ${profile.pro ? '<span class="pro-badge">PRO</span>' : ''}</h4>
        ${profile.bio ? `<p class="account-bio">“${esc(profile.bio)}”</p>` : ''}
        <dl class="account-stats">
          ${profile.boostPoints ? `<div><dt>Boost points</dt><dd>${esc(profile.boostPoints)}</dd></div>` : ''}
          ${profile.artTokens ? `<div><dt>ART tokens</dt><dd>${esc(profile.artTokens)}</dd></div>` : ''}
          ${profile.projectCount != null ? `<div><dt>Projects</dt><dd>${esc(String(profile.projectCount))}</dd></div>` : ''}
        </dl>
        ${profile.recentBoostsEarned ? `<p class="account-muted">${esc(profile.recentBoostsEarned)}</p>` : ''}
        <p class="account-muted">${esc(profile.source)} · captured ${esc(profile.capturedAt)}.</p>
      </div>` : '';
    const memberFunds = summary.funds.filter(entry => entry.reported);
    const membershipHtml = memberFunds.length
      ? `<ul>${memberFunds.map(entry => entityButton(entry.fund, `member · ${entry.memberSource}`)).join('')}</ul>`
      : `<p><strong>None</strong> <span class="account-muted">· ${esc(profile && profile.fundMembershipNote
        ? profile.fundMembershipNote : 'No approved fund memberships recorded.')}</span></p>`;
    const boostedSlugs = new Set(summary.boosted.map(entry => entry.entity && entry.entity.slug).filter(Boolean));
    const offCanopyBoosts = (profile && Array.isArray(profile.recentBoosts) ? profile.recentBoosts : [])
      .filter(row => !boostedSlugs.has(row.slug));
    const boostCount = summary.boosted.length + offCanopyBoosts.length;
    const boostsHtml = boostCount
      ? `<ul>${summary.boosted.filter(entry => entry.entity).map(entry => entityButton(entry.entity, `${entry.sourceLabel} · in this canopy`)).join('')}${offCanopyBoosts
        .map(row => `<li class="account-plain">${esc(row.name)} <small>not in the latest public index</small></li>`).join('')}</ul>
        <p class="account-muted">Most recent boosts shown on the public profile; amounts and an all-time tally need sign-in.</p>`
      : '<p class="account-muted">No boosts recorded yet. Import a participation file or wait for sign-in.</p>';
    const stewardHtml = summary.stewarded.length
      ? `<ul>${summary.stewarded.map(entry => entityButton(entry.fund, `${entry.sourceLabel} · unverified`)).join('')}</ul>`
      : profile && Array.isArray(profile.stewardship) && profile.stewardship.length === 0
        ? '<p><strong>None</strong> <span class="account-muted">· not a steward of any Artizen fund (per the creator).</span></p>'
        : '<p class="account-muted">Artizen’s public feed does not publish fund stewards. Stewardship can be declared in a participation import (<code>fund-steward</code>) until sign-in arrives.</p>';
    const placeRows = [
      ...summary.locations.projects.map(row => ({ ...row, role: 'Project' })),
      ...summary.locations.funds.filter(row => row.location).map(row => ({ ...row, role: 'Fund' })),
    ];
    const locationsHtml = `<p><strong>Creator:</strong> ${locationText(summary.locations.creator)}</p>${placeRows.length
      ? `<ul class="account-locations">${placeRows.map(row => `<li><span>${row.role}: ${esc(row.entity.name)}</span> ${locationText(row.location)}</li>`).join('')}</ul>` : ''}
      <p class="account-muted">A creator’s location is kept separate from the places of their projects and funds; each is shared (or not) on its own card and appears as its own globe marker.</p>`;

    return `<section class="artizen-account" aria-labelledby="artizen-account-title">
      <div class="artizen-account-head">
        <img class="artizen-logo" src="assets/artizen-logo.png" alt="" />
        <h3 id="artizen-account-title">Artizen account</h3>
        <span class="coming-soon-badge">Coming soon</span>
      </div>
      <p class="artizen-login-status" role="status"><span class="login-dot" aria-hidden="true"></span>Not signed in to Artizen · sign-in is not available yet</p>
      <div class="artizen-wallet-status artizen-wallet-status--${tone}">
        <strong>${esc(headline)}</strong>
        ${declared ? `<p>${esc(network ? network.name : `Chain ${declared.chainId}`)} · <code title="${esc(declared.address)}">${esc(short(declared.address))}</code></p>` : ''}
        <p>${esc(hint)}</p>
      </div>
      <form class="artizen-login-form" aria-describedby="artizen-login-note" onsubmit="return false">
        <fieldset disabled>
          <legend>Sign in with Artizen</legend>
          <label>Artizen profile page<input type="url" placeholder="https://artizen.fund/…" /></label>
          <label>Artizen wallet address<input type="text" placeholder="0x…" /></label>
          <button type="submit">Sign in with Artizen</button>
        </fieldset>
        <p id="artizen-login-note" class="coming-soon-note">Coming soon — we will only enable this through an Artizen-approved sign-in. DecentCanopy will never ask for your Artizen password or session cookies.</p>
      </form>
      <div class="artizen-account-space">
        <h3>${summary.wallet.state === 'declared-matches' || isViewer ? 'Your Artizen space' : 'Creator’s Artizen space'}</h3>
        ${isViewer ? '<p class="account-viewer-note">You chose this card as your view in this browser. That is a local preference, not verified Artizen ownership.</p>' : ''}
        <p class="account-muted">Available now from the public graph and curated or participant-reported links. More unlocks after sign-in.</p>
        ${profileHtml}
        <div class="details-group account-group"><h4>Projects (${summary.projects.length})</h4>${projectsHtml}</div>
        <div class="details-group account-group"><h4>Fund memberships (${memberFunds.length})</h4>${membershipHtml}</div>
        <div class="details-group account-group"><h4>Projects you support (${summary.supported.length})</h4>${supportHtml}</div>
        <div class="details-group account-group"><h4>Recent boosts (${boostCount})</h4>${boostsHtml}</div>
        <div class="details-group account-group"><h4>Fund submissions (${viaFunds.length})</h4><p class="account-muted">From the public graph: funds these projects were submitted to (or curated or funded in). A submission is not membership; only fund approval makes a project part of a fund.</p>${fundsHtml}</div>
        <div class="details-group account-group"><h4>Fund stewardship (${summary.stewarded.length})</h4>${stewardHtml}</div>
        <div class="details-group account-group${summary.collected.length ? '' : ' account-group--locked'}"><h4>Artifact collection (${summary.collected.length}) <span class="coming-soon-badge">Full list coming soon</span></h4>${collectedHtml}</div>
        <div class="details-group account-group"><h4>Locations</h4>${locationsHtml}</div>
      </div>
    </section>`;
  }

  const api = { summarize, walletStatus, renderCreator };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CanopyArtizenAccount = api;
}(typeof window !== 'undefined' ? window : globalThis));
