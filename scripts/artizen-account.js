/*
 * Creator "Artizen account" panel. Artizen sign-in is not available yet, so the login form is
 * rendered disabled. Everything shown is derived from the public graph snapshot, curated links,
 * or browser-local participant reports — never from Artizen account access.
 */
(function (root) {
  'use strict';

  const PROJECT_LINKS = ['creator-associated', 'collaboration'];
  const FUND_RELATIONS = ['submitted', 'curated', 'funded'];

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

    function fundEntry(fundId) {
      if (!funds.has(fundId)) funds.set(fundId, { fund: entitiesById[fundId], relations: new Set(), via: new Set(), reported: false });
      return funds.get(fundId);
    }

    associations.forEach(edge => {
      const peer = other(edge, creator.id);
      if (!peer || !entitiesById[peer]) return;
      if (kindOf(peer) === 'project' && PROJECT_LINKS.includes(edge.type)) {
        projects.set(peer, { project: entitiesById[peer], relation: edge.type, through: null });
      } else if (kindOf(peer) === 'fund' && edge.type === 'fund-member') {
        fundEntry(peer).reported = true;
      } else if (kindOf(peer) === 'fund' && edge.type === 'fund-steward' && edge.source === creator.id) {
        stewarded.set(peer, { fund: entitiesById[peer], sourceLabel: edge.sourceLabel || 'Participant-reported' });
      }
    });

    // Projects that grew out of the creator's projects (one hop of associated-project).
    [...projects.values()].forEach(({ project }) => {
      associations.forEach(edge => {
        if (edge.type !== 'associated-project' || edge.source !== project.id) return;
        const child = entitiesById[edge.target];
        if (child && child.kind === 'project' && !projects.has(child.id)) {
          projects.set(child.id, { project: child, relation: 'associated-project', through: project });
        }
      });
    });

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
      stewarded: [...stewarded.values()].sort((a, b) => a.fund.name.localeCompare(b.fund.name)),
      locations: {
        creator: creator.sharedLocation || null,
        projects: [...projects.values()].map(({ project }) => placed(project)),
        funds: [...funds.values()].filter(entry => entry.fund).map(entry => placed(entry.fund)),
      },
    };
  }

  const WALLET_MESSAGES = {
    'none-declared': ['unknown', 'No public wallet is linked to this creator in DecentCanopy yet.', 'Use “Edit website / wallet / location” to link your public Artizen wallet address.'],
    'none-declared-connected': ['unknown', 'No public wallet is linked to this creator in DecentCanopy yet.', 'Your connected wallet can be filled in with “Edit website / wallet / location”.'],
    'declared-not-connected': ['known', 'A public wallet is linked to this creator in DecentCanopy.', 'Connect your wallet in the header to check whether it matches.'],
    'declared-differs': ['differs', 'Your connected wallet does not match the wallet linked to this creator.', 'This may be someone else’s canopy, or you may use a different wallet on Artizen.'],
    'declared-matches': ['matches', 'Your connected wallet matches the wallet linked to this creator.', 'A match is a helpful hint, not proof that this Artizen account is yours.'],
    'declared-matches-other-network': ['matches', 'Your connected address matches, on a different network.', 'The link was declared for another network; addresses match but the network differs.'],
  };

  function renderCreator(creator, context) {
    const { associations, entitiesById, connectedWallet, networks, esc } = context;
    const summary = summarize(creator, associations, entitiesById, connectedWallet);
    const [tone, headline, hint] = WALLET_MESSAGES[summary.wallet.state];
    const declared = summary.wallet.declared;
    const network = declared && networks[declared.chainId];
    const short = address => `${address.slice(0, 6)}…${address.slice(-4)}`;
    const entityButton = (entity, detail) =>
      `<li><button type="button" class="related-entity" data-related-node="${esc(entity.id)}"><strong>${esc(entity.name)}</strong>${detail ? `<small>${esc(detail)}</small>` : ''}</button></li>`;
    const locationText = location => location
      ? `${esc(location.label)} · ${esc(location.precision)}`
      : '<span class="account-muted">not shared</span>';
    const relationLabel = { 'creator-associated': 'Creator-curated link', collaboration: 'Reported collaboration' };

    const projectsHtml = summary.projects.length
      ? `<ul>${summary.projects.map(({ project, relation, through }) => entityButton(project,
        through ? `Grew from ${through.name}` : relationLabel[relation])).join('')}</ul>`
      : '<p class="account-muted">No projects are linked to this creator yet.</p>';
    const fundsHtml = summary.funds.length
      ? `<ul>${summary.funds.slice(0, 12).map(entry => entityButton(entry.fund, [
        entry.relations.length ? entry.relations.join(', ') : null,
        entry.via.length ? `via ${entry.via.join(', ')}` : null,
        entry.reported ? 'participant-reported membership' : null,
      ].filter(Boolean).join(' · '))).join('')}</ul>${summary.funds.length > 12 ? `<p class="account-muted">Showing 12 of ${summary.funds.length} funds.</p>` : ''}`
      : '<p class="account-muted">No fund relationships recorded for this creator’s projects.</p>';
    const stewardHtml = summary.stewarded.length
      ? `<ul>${summary.stewarded.map(entry => entityButton(entry.fund, `${entry.sourceLabel} · unverified`)).join('')}</ul>`
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
        <h3>${summary.wallet.state === 'declared-matches' ? 'Your Artizen space' : 'Creator’s Artizen space'}</h3>
        <p class="account-muted">Available now from the public graph and curated or participant-reported links. More unlocks after sign-in.</p>
        <div class="details-group account-group"><h4>Projects (${summary.projects.length})</h4>${projectsHtml}</div>
        <div class="details-group account-group"><h4>Funds in this canopy (${summary.funds.length})</h4><p class="account-muted">Derived from the public graph: funds these projects were submitted to, curated in, or funded by.</p>${fundsHtml}</div>
        <div class="details-group account-group"><h4>Fund stewardship (${summary.stewarded.length})</h4>${stewardHtml}</div>
        <div class="details-group account-group account-group--locked"><h4>Artifact collection <span class="coming-soon-badge">Coming soon</span></h4><p class="account-muted">Collected artifacts need Artizen sign-in or verified ledger receipts; the public feed has no purchase records.</p></div>
        <div class="details-group account-group"><h4>Locations</h4>${locationsHtml}</div>
      </div>
    </section>`;
  }

  const api = { summarize, walletStatus, renderCreator };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CanopyArtizenAccount = api;
}(typeof window !== 'undefined' ? window : globalThis));
