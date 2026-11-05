(function (root) {
  'use strict';
  const model = root.CanopySupporterModel;
  const ownedViews = new Map();
  let snapshot, loadedAt = 0;
  function load() {
    if (!snapshot || Date.now() - loadedAt > 60000) {
      loadedAt = Date.now();
      snapshot = fetch('data/supporter-dnfts.json', { cache: 'no-store', signal: AbortSignal.timeout(15000) }).then(response => {
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
  function card(token, data, inlineCheckout = false) {
    const mirror = root.CanopyRepositoryActivity?.releaseMirror(root.CanopyRepositoryActivityUI?.getData(), token);
    const item = element('details', undefined, 'supporter-token');
    const summary = element('summary');
    summary.append(coin(token, mirror), element('span', token.name));
    item.append(summary);
    const content = element('div', undefined, 'supporter-token-body');
    const chain = model.CHAINS[token.chainId];
    const stale = token.stale || data.chains[token.chainId].status !== 'ok';
    content.append(element('p', `${chain.name} · Minted ${token.totalMinted ?? 'unknown'} / ${token.maxSupply === '0' ? 'uncapped' : token.maxSupply ?? 'unknown'} editions`));
    const date = model.releaseDate(token, root.CanopyRepositoryActivityUI?.getData());
    content.append(element('p', date ? `Release date: ${new Date(date).toISOString().slice(0, 10)} (published evidence / metadata)` : 'Release date unknown; not sorted by scan timestamp.', 'details-muted'));
    const offers = token.listings.filter(l => l.active && BigInt(l.available) > 0n);
    for (const offer of offers) {
      content.append(element('p', `${offer.price} ${offer.currency}${offer.currency !== 'ETH' && offer.ethPrice && offer.priceETH !== '0' ? ` / ${offer.ethPrice} ETH` : ''} · ${offer.available} available · Listing #${offer.id}${stale ? ' (last observed; recheck before supporting)' : ''}`));
      const own = root.CanopySupporterPurchase?.EDITION;
      if (inlineCheckout && own && token.chainId === own.chainId && token.contract.toLowerCase() === own.nft.toLowerCase()
        && token.tokenId === own.tokenId && offer.id === own.listingId) {
        const buy = element('button', 'Buy here · 10 USDC + gas', 'toolbar-btn');
        buy.type = 'button';
        buy.addEventListener('click', () => {
          const checkout = document.getElementById('canopy-supporter-buy');
          checkout.scrollIntoView({ block: 'center' }); checkout.focus();
          checkout.click();
        });
        content.append(buy);
      }
      else if (model.checkoutSupported(token, offer)) content.append(link(model.listingUrl(token, offer), 'Support on DecentMarket ↗'));
      else content.append(element('p', 'This observed listing is not supported by the current Base USDC checkout. View its chain/contract evidence; no purchase link invented.', 'details-muted'));
    }
    if (!offers.length) content.append(element('p', 'No available escrow listing observed.'));
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
    content.append(link(model.listingUrl(token), 'View on DecentMarket ↗'), document.createTextNode(' · '), link(`${chain.explorer}/token/${token.contract}?a=${token.tokenId}`, 'Block explorer ↗'));
    if (offers.length) content.append(element('p', inlineCheckout ? 'Buy here uses the Canopy checkout above. Market and explorer links remain available for independent review. Availability and price are rechecked before purchase.' : 'Opens the public buyer page for this chain, escrow and listing. It rechecks the listing before any wallet purchase. Availability and price may have changed.', 'details-muted'));
    if (token.projects.length) content.append(element('p', `Project match: ${token.projects.map(p => `${p.repo} (${p.matchedBy})`).join(', ')}. Metadata is a discovery claim, not verified project ownership.`, 'details-muted'));
    const properties = token.properties || {};
    // Release metadata claims; ENS may still serve an earlier version until the steward signs.
    const siteCid = typeof properties.site_cid === 'string' && /^b[a-z2-7]{20,}$/.test(properties.site_cid) ? properties.site_cid : '';
    const ensName = typeof properties.ens_name === 'string' && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+eth$/.test(properties.ens_name) ? properties.ens_name : '';
    if (siteCid || ensName) {
      const site = element('p');
      if (siteCid) site.append(link(`https://${siteCid}.ipfs.dweb.link/`, 'Release site on IPFS ↗'));
      if (siteCid && ensName) site.append(document.createTextNode(' · '));
      if (ensName) site.append(link(`https://${ensName}.limo/`, `${ensName} ↗`));
      content.append(site);
    }
    for (const key of ['repo', 'project', 'version', 'tag', 'commit', 'codeArchiveCid', 'code_archive_cid', 'site_cid', 'ens_name', 'license']) {
      if (typeof properties[key] === 'string') content.append(element('p', `${key}: ${properties[key]}`, 'supporter-token-address'));
    }
    content.append(element('small', `Observed: ${token.observedAt || data.generatedAt}${stale ? ' · incomplete or stale chain snapshot' : ''}`));
    item.append(content);
    return item;
  }
  function rolodex(container, tokens, data, inlineCheckout = false) {
    const controls = element('div', undefined, 'supporter-controls');
    const label = element('label', 'Find a Supporter edition');
    const search = element('input');
    search.type = 'search'; search.placeholder = 'Project, type, chain or version'; label.append(search);
    const prev = element('button', 'Previous'), next = element('button', 'Next');
    prev.type = next.type = 'button';
    prev.className = next.className = 'toolbar-btn';
    const position = element('p', '', 'details-muted');
    position.setAttribute('role', 'status');
    const stage = element('div', undefined, 'supporter-rolodex-stage');
    stage.tabIndex = 0; stage.setAttribute('aria-label', 'Supporter rolodex; use left and right arrows to browse');
    let selected = 0, visible = [];
    function render() {
      visible = model.selectTokens(tokens, search.value, root.CanopyRepositoryActivityUI?.getData());
      selected = Math.min(selected, Math.max(0, visible.length - 1));
      prev.disabled = selected === 0; next.disabled = selected >= visible.length - 1;
      position.textContent = visible.length ? `${selected + 1} of ${visible.length} · newest known releases first; undated editions follow` : 'No matching Supporter editions.';
      stage.replaceChildren();
      if (visible.length) {
        const token = visible[selected], item = card(token, data, inlineCheckout);
        item.open = true; stage.append(item);
      }
    }
    function move(delta) { selected = Math.max(0, Math.min(visible.length - 1, selected + delta)); render(); }
    search.addEventListener('input', () => { selected = 0; render(); });
    prev.addEventListener('click', () => move(-1)); next.addEventListener('click', () => move(1));
    stage.addEventListener('keydown', event => {
      if (event.target !== stage || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault(); move(event.key === 'ArrowRight' ? 1 : -1);
    });
    let wheelAt = 0, touchX = null;
    stage.addEventListener('wheel', event => {
      if (Math.abs(event.deltaX) < 15 || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      event.preventDefault();
      if (Date.now() - wheelAt > 250) { wheelAt = Date.now(); move(Math.sign(event.deltaX)); }
    }, { passive: false });
    stage.addEventListener('touchstart', event => { touchX = event.touches[0]?.clientX ?? null; }, { passive: true });
    stage.addEventListener('touchend', event => {
      const end = event.changedTouches[0]?.clientX;
      if (touchX !== null && end !== undefined && Math.abs(end - touchX) > 60) move(end < touchX ? 1 : -1);
      touchX = null;
    });
    controls.append(label, prev, next, position);
    container.append(controls, stage); render();
  }
  function mountOwned(container, data, node) {
    const section = element('section', undefined, 'details-group supporter-owned');
    section.setAttribute('data-supporter-owned', '');
    section.append(element('h3', node.kind === 'creator' ? 'Supporter editions held by this creator' : 'Your Supporter editions for this project'));
    section.append(element('p', 'Current wallet holdings, not purchase history: gifts/transfers may be included. Read-only public RPC queries; no signature or payment. Coverage is limited to this known inventory.', 'details-muted'));
    const status = element('p', '', 'details-muted'), refresh = element('button', 'Check / refresh holdings', 'toolbar-btn'), results = element('div');
    status.setAttribute('role', 'status'); refresh.type = 'button';
    section.append(status, refresh, results); container.append(section);
    let generation = 0;
    async function check() {
      const request = ++generation;
      results.replaceChildren();
      const wallet = node.kind === 'creator' ? node.creatorRecord?.wallet || node.wallet || node.address : root.decentCanopyWallet?.address;
      if (!model.address(wallet)) { status.textContent = 'Connect a wallet to see your holdings. No ownership inferred from creator or escrow stock.'; refresh.disabled = false; return; }
      refresh.disabled = true; status.textContent = `Reading balances for ${wallet}…`;
      try {
        const tokens = node.kind === 'creator' ? data.tokens : tokensForNode(data, node);
        const scope = { ...data, tokens, ...model.indexTokens(tokens) };
        const result = await model.readHoldings(scope, wallet, root.ethers);
        if (!section.isConnected || request !== generation) return;
        const ids = node.kind === 'creator' ? null : new Set(tokensForNode(data, node).map(t => t.id));
        const owned = result.holdings.filter(h => !ids || ids.has(h.token.id));
        status.textContent = `${owned.length ? `${owned.length} held edition(s)` : result.errors.length ? 'Holdings not fully known' : 'No held editions found in the checked inventory'}. Wallet ${result.wallet}. Checked ${result.checkedAt}. ${result.errors.join(' ')}${Object.values(data.chains).some(c => c.status !== 'ok') ? ' Inventory discovery is incomplete; absence here is not proof of no other holdings.' : ''}`;
        for (const h of owned) {
          const row = element('p', `${h.token.name} · quantity ${h.quantity} · ${model.CHAINS[h.token.chainId].name} block ${h.block} · `);
          row.append(link(`${model.CHAINS[h.token.chainId].explorer}/token/${h.token.contract}?a=${wallet}`, 'View wallet holdings ↗'));
          results.append(row);
        }
      } catch (error) {
        if (section.isConnected && request === generation) status.textContent = `Holdings unavailable: ${error.message}`;
      } finally { if (request === generation) refresh.disabled = false; }
    }
    refresh.addEventListener('click', check);
    if (node.kind !== 'creator' && root.addEventListener) {
      for (const view of ownedViews.keys()) if (!view.isConnected) ownedViews.delete(view);
      ownedViews.set(section, check);
    }
    status.textContent = 'Choose Check / refresh holdings to query this public wallet. Unknown until checked.';
  }
  function mountSeries() {
    const container = document.getElementById('canopy-supporter-series');
    if (!container || container.dataset.loaded) return;
    container.dataset.loaded = 'true';
    const linked = new URLSearchParams(root.location.search).get('supporters') === '1';
    if (linked) {
      document.getElementById('decent-head-about-button').click();
      container.scrollIntoView({ block: 'start' });
    }
    let timer;
    const activity = root.CanopyRepositoryActivityUI;
    const ready = activity?.getData() ? Promise.resolve('') : Promise.race([
      activity?.load(),
      new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('release mirror read timed out')), 12000); }),
    ]).then(() => '', error => `Official release artwork/date mirrors unavailable: ${error.message}. Cached metadata, if present, is still shown.`)
      .finally(() => clearTimeout(timer));
    Promise.all([load(), ready]).then(([data, warning]) => {
      container.replaceChildren();
      container.append(element('p', `Public contract / escrow inventory observed ${data.generatedAt}. Prices and stock are snapshots; buyer checkout rechecks them. No equity or financial return promised. Incomplete chains remain labeled on each edition.`, 'details-muted'));
      if (warning) container.append(element('p', warning, 'details-muted'));
      rolodex(container, tokensForNode(data, { kind: 'repository', repoUrl: 'https://github.com/TheJollyLaMa/DecentCanopy' }), data, true);
      if (linked) {
        container.scrollIntoView({ block: 'start' });
        container.querySelector('input')?.focus({ preventScroll: true });
      }
    }).catch(error => {
      container.dataset.loaded = '';
      container.replaceChildren(element('p', `Supporter inventory unavailable: ${error.message}`));
      const retry = element('button', 'Retry Supporter inventory'); retry.type = 'button';
      retry.addEventListener('click', mountSeries); container.append(retry);
    });
  }
  function mount(container, node) {
    if (!container || !node || !['project', 'repository', 'creator', 'initiative', 'product'].includes(node.kind)) return;
    if (container.querySelector('[data-supporter-dnfts]')) return;
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
      rolodex(section, tokens, data);
      mountOwned(section, data, node);
    }).catch(() => {
      if (section.isConnected) status.textContent = 'Supporter DNFT snapshot unavailable. This does not mean no tokens exist.';
    });
  }
  if (root.addEventListener) {
    root.addEventListener('DOMContentLoaded', mountSeries);
    root.addEventListener('decentcanopy:wallet-change', () => {
      for (const [view, check] of ownedViews) {
        if (view.isConnected) check();
        else ownedViews.delete(view);
      }
    });
  }
  const api = { load, tokensForNode, mount, rolodex, mountSeries };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CanopySupporterDNFTs = api;
}(typeof window !== 'undefined' ? window : globalThis));
