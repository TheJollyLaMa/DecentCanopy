(function (root) {
  'use strict';
  const model = root.CanopySupporterModel;
  let snapshot, loadedAt = 0;
  function load() {
    if (!snapshot || Date.now() - loadedAt > 60000) {
      loadedAt = Date.now();
      snapshot = fetch('data/supporter-dnfts.json', { cache: 'no-store' }).then(response => {
        if (!response.ok) throw new Error('Snapshot unavailable');
        return response.json();
      }).then(model.validateSnapshot).catch(error => { snapshot = null; throw error; });
    }
    return snapshot;
  }
  function tokensForNode(data, node) {
    const ids = new Set();
    const addRepo = repo => (data.byProject[model.normalizeRepo(repo)] || []).forEach(id => ids.add(id));
    const record = node.creatorRecord;
    const project = node.creatorProjectKey ? record?.projects.find(p => p.key === node.creatorProjectKey) : null;
    const repos = [node.repoUrl, node.projectDetails?.repoUrl, ...(project?.repositories || [])];
    repos.forEach(addRepo);
    if (node.kind === 'creator') {
      const wallet = record?.wallet || node.wallet || node.address;
      if (wallet) (data.byCreator[String(wallet).toLowerCase()] || []).forEach(id => ids.add(id));
      if (node.github?.login) (data.byCreator[`github:${node.github.login.toLowerCase()}`] || []).forEach(id => ids.add(id));
    } else if (!repos.some(model.normalizeRepo)) {
      // No repository declared: match only a whole project name/known repo basename, never the steward's wallet.
      for (const token of data.tokens) if (token.projects.some(p => [p.name, p.repo.split('/')[1], ...(p.aliases || [])].some(n => model.mentions(node.name, n) && model.mentions(n, node.name)))) ids.add(token.id);
    }
    return data.tokens.filter(t => ids.has(t.id));
  }
  function element(tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = String(text);
    if (className) el.className = className;
    return el;
  }
  function link(url, text) {
    const a = element('a', text);
    a.href = model.httpsUrl(url);
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }
  function coin(token, mirror) {
    const frame = element('span', undefined, 'supporter-coin');
    frame.setAttribute('aria-hidden', 'true');
    const initials = token.projects[0]?.name || token.name;
    const fallback = element('span', initials.split(/\s+/).map(w => w[0]).join('').slice(0, 3).toUpperCase(), 'supporter-coin-initials');
    frame.append(fallback);
    const url = mirror?.frontPreview || model.mediaUrl(token.image);
    if (url) {
      const image = element('img');
      image.src = url;
      image.alt = '';
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => image.remove(), { once: true });
      frame.append(image);
    }
    return frame;
  }
  function card(token, data) {
    const mirror = root.CanopyRepositoryActivity?.releaseMirror(root.CanopyRepositoryActivityUI?.getData(), token);
    const item = element('details', undefined, 'supporter-token');
    const summary = element('summary');
    summary.append(coin(token, mirror), element('span', token.name));
    item.append(summary);
    const content = element('div', undefined, 'supporter-token-body');
    const chain = model.CHAINS[token.chainId];
    const stale = token.stale || data.chains[token.chainId].status !== 'ok';
    content.append(element('p', `${chain.name} · Minted ${token.totalMinted ?? 'unknown'} / ${token.maxSupply === '0' ? 'uncapped' : token.maxSupply ?? 'unknown'} editions`));
    if (token.description) content.append(element('p', token.description));
    if (token.metadataStatus && token.metadataStatus !== 'ok') content.append(element('p', `Token metadata ${token.metadataStatus}; name/artwork may come from a prior snapshot or the on-chain listing note.`, 'details-muted'));
    if (mirror) {
      item.open = true;
      content.append(element('p', 'Official GitHub release artwork mirror, matched by chain, contract, token ID and declared metadata URI. This is release evidence, not a fresh IPFS retrieval or proof of stock.', 'details-muted'));
      const art = element('div', undefined, 'supporter-release-art');
      for (const [side, url, preview] of [['Front', mirror.front, mirror.frontPreview], ['Back', mirror.back, mirror.backPreview]]) {
        const figure = element('figure');
        if (preview) {
          const image = element('img');
          image.src = preview;
          image.alt = `${token.name} — ${side.toLowerCase()} artwork`;
          image.loading = 'lazy';
          image.addEventListener('error', () => {
            figure.append(element('p', `${side} artwork unavailable; open the official release asset below.`));
            image.remove();
          }, { once: true });
          figure.append(image);
        } else figure.append(element('p', `${side} preview unavailable; source asset linked below.`));
        figure.append(link(url, `${side} artwork ↗`));
        art.append(figure);
      }
      content.append(art);
    }
    content.append(element('p', `Contract: ${token.contract} · Token ID: ${token.tokenId}`, 'supporter-token-address'));
    if (token.creator) content.append(element('p', `Creator wallet: ${token.creator}`, 'supporter-token-address'));
    const offers = token.listings.filter(l => l.active && BigInt(l.available) > 0n);
    for (const offer of offers) {
      content.append(element('p', `${offer.price} ${offer.currency}${offer.currency !== 'ETH' && offer.ethPrice && offer.priceETH !== '0' ? ` / ${offer.ethPrice} ETH` : ''} · ${offer.available} available · Listing #${offer.id}${stale ? ' (last observed; recheck before supporting)' : ''}`));
      content.append(link(model.listingUrl(token, offer), 'Support on DecentMarket ↗'));
    }
    if (!offers.length) content.append(element('p', 'No available escrow listing observed.'));
    content.append(link(model.listingUrl(token), 'View on DecentMarket ↗'), document.createTextNode(' · '), link(`${chain.explorer}/token/${token.contract}?a=${token.tokenId}`, 'Block explorer ↗'));
    if (offers.length) content.append(element('p', 'Opens the public buyer page for this chain, escrow and listing. It rechecks the listing before any wallet purchase. Availability and price may have changed.', 'details-muted'));
    if (token.projects.length) content.append(element('p', `Project match: ${token.projects.map(p => `${p.repo} (${p.matchedBy})`).join(', ')}. Metadata is a discovery claim, not verified project ownership.`, 'details-muted'));
    const properties = token.properties || {};
    for (const key of ['repo', 'project', 'version', 'tag', 'commit', 'codeArchiveCid', 'code_archive_cid', 'license']) {
      if (typeof properties[key] === 'string') content.append(element('p', `${key}: ${properties[key]}`, 'supporter-token-address'));
    }
    content.append(element('small', `Observed: ${token.observedAt || data.generatedAt}${stale ? ' · incomplete or stale chain snapshot' : ''}`));
    item.append(content);
    return item;
  }
  function mount(container, node) {
    if (!container || !node || !['project', 'repository', 'creator', 'initiative', 'product'].includes(node.kind)) return;
    container.querySelector('[data-supporter-dnfts]')?.remove();
    const section = element('section', undefined, 'details-group supporter-dnfts');
    section.setAttribute('data-supporter-dnfts', '');
    section.append(element('h3', 'Supporter DNFTs'));
    const status = element('p', 'Loading public-ledger snapshot…', 'details-muted');
    section.append(status);
    container.append(section);
    load().then(data => {
      if (!section.isConnected) return;
      const tokens = tokensForNode(data, node);
      const incomplete = Object.values(data.chains).some(c => c.status !== 'ok');
      status.textContent = `${tokens.length ? `${tokens.length} Supporter DNFT token${tokens.length === 1 ? '' : 's'}` : 'No matching Supporter DNFTs in this snapshot'}. Updated ${data.generatedAt}; scheduled about every 6 hours, not live stock. ${incomplete ? 'Chain reads are incomplete/unavailable; absence is not evidence that none exist.' : 'Cached public-ledger data; prices and availability may change.'}`;
      tokens.forEach(token => section.append(card(token, data)));
    }).catch(() => {
      if (section.isConnected) status.textContent = 'Supporter DNFT snapshot unavailable. This does not mean no tokens exist.';
    });
  }
  const api = { load, tokensForNode, mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CanopySupporterDNFTs = api;
}(typeof window !== 'undefined' ? window : globalThis));
