import { loadPublishedCreator } from './published-creator.mjs';
import { readCreatorListings } from './vendor/market/supporter-listings.mjs';

window.CanopyProjectSales = {
  async mount(root) {
    const targets = [...root.querySelectorAll('[data-project-sales]')];
    if (!targets.length) return;
    const notice = text => targets.forEach(target => { if (target.isConnected) target.textContent = text; });
    notice('Loading current public project Supporter listings...');
    try {
      const response = await fetch('community-rewards.json', { cache: 'no-store', signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`Supporter sale configuration unavailable (${response.status})`);
      const config = (await response.json()).firstProject;
      if (!config?.collectionAddress || !config.listingsAddress) throw new Error('Project sales unavailable until the verified creator/listings deployment is activated');
      const wallet = targets[0].dataset.creatorWallet, { record } = await loadPublishedCreator(wallet);
      const keys = targets.map(target => target.dataset.projectKey);
      if (targets.some(target => target.dataset.creatorWallet !== wallet) || keys.some(key => !record.projects.some(p => p.key === key))) throw new Error('Displayed projects are no longer in this creator’s current signed public profile');
      const rows = await readCreatorListings({ ...config, chainId: 8453 }, wallet, keys,
        { ethers: window.ethers, provider: new window.ethers.JsonRpcProvider('https://mainnet.base.org', 8453) });
      for (const target of targets) {
        if (!target.isConnected) continue;
        const offers = rows.filter(row => row.projectKey === target.dataset.projectKey);
        target.replaceChildren();
        if (!offers.length) { target.textContent = 'Current public project verified; no active creator-owned Supporter listing in the configured contracts.'; continue; }
        for (const offer of offers) {
          const line = document.createElement('p'), link = document.createElement('a');
          link.textContent = `Supporter #${offer.tokenId}: ${window.ethers.formatUnits(offer.priceUnits, offer.decimals)} ${offer.symbol} · ${offer.quantity} available · review & buy in Market`;
          const url = new URL('https://thejollylama.github.io/DecentMarket/project-supporters.html');
          url.search = new URLSearchParams({ creator: wallet, projectKey: offer.projectKey, listingId: offer.listingId }).toString();
          link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
          line.append(link); target.append(line);
        }
      }
    } catch (error) {
      notice(`Supporter sales unavailable: ${error.shortMessage || error.message}`);
      console.error('[Canopy project Supporter sales]', error);
    }
  },
};
