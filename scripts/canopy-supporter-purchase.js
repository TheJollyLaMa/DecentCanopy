(function (root) {
  'use strict';
  // Adapted from Planning Office js/supporter-checkout.js at 940859b (Apache-2.0), for Canopy's UMD wallet.
  const EDITION = Object.freeze({
    chainId: 8453, tokenId: '79', listingId: '9', price: 10000000n,
    nft: '0xe63EC9f8228720bAAC2fD528C0A6d06B3Dc5439B',
    escrow: '0x31b07b83e99A9bdF379bf40225b8A80d3804C89d',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    metadataURI: 'ipfs://QmQqQtuSeab78F3pdBcMbvSopYZLa51zJ4JxcodQ2ugy9d',
  });
  const ESCROW = [
    'function getListing(uint256) view returns (tuple(address nftContract,uint256 tokenId,uint256 priceETH,address priceToken,uint256 priceAmount,uint256 available,bool active,string note))',
    'function getNFTBalance(address,uint256) view returns (uint256)', 'function paused() view returns (bool)',
    'function purchaseWithToken(uint256,uint256)',
    'event Purchased(uint256 indexed listingId,address indexed buyer,uint256 amount,address indexed paymentToken,uint256 totalPaid)',
  ];
  const USDC = ['function balanceOf(address) view returns (uint256)', 'function allowance(address,address) view returns (uint256)', 'function approve(address,uint256) returns (bool)'];
  const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
  function validateListing(listing, stock, paused, uri) {
    if (paused) throw new Error('Supporter sales are paused.');
    if (!listing.active || listing.available < 1n || stock < 1n) throw new Error('Canopy Supporter editions are not currently available.');
    if (!equal(listing.nftContract, EDITION.nft) || listing.tokenId !== BigInt(EDITION.tokenId)
      || listing.priceETH !== 0n || !equal(listing.priceToken, EDITION.usdc) || listing.priceAmount !== EDITION.price
      || uri !== EDITION.metadataURI) throw new Error('Canopy token, metadata or 10-USDC listing terms changed. No purchase authorized.');
  }
  async function inspect(runner, ethers) {
    if ((await runner.getNetwork()).chainId !== 8453n) throw new Error('The purchase provider is not on Base.');
    const escrow = new ethers.Contract(EDITION.escrow, ESCROW, runner);
    const nft = new ethers.Contract(EDITION.nft, ['function uri(uint256) view returns (string)'], runner);
    const [listing, stock, paused, uri] = await Promise.all([
      escrow.getListing(EDITION.listingId), escrow.getNFTBalance(EDITION.nft, EDITION.tokenId),
      escrow.paused(), nft.uri(EDITION.tokenId),
    ]);
    validateListing(listing, stock, paused, uri);
    return { escrow, listing };
  }
  async function purchase(raw, ethers, { status = () => {}, transaction = () => {} } = {}) {
    const accounts = await raw.request({ method: 'eth_requestAccounts' });
    const account = accounts?.[0];
    if (!/^0x[\da-f]{40}$/i.test(account || '')) throw new Error('Wallet did not return a valid account.');
    if (BigInt(await raw.request({ method: 'eth_chainId' })) !== 8453n) {
      try { await raw.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x2105' }] }); }
      catch (error) {
        if (Number(error.code ?? error.data?.originalError?.code) !== 4902) throw error;
        await raw.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x2105', chainName: 'Base',
          rpcUrls: ['https://mainnet.base.org'], blockExplorerUrls: ['https://basescan.org'],
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 } }] });
        await raw.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x2105' }] });
      }
    }
    let changed = false;
    const change = () => { changed = true; };
    raw.on?.('accountsChanged', change); raw.on?.('chainChanged', change);
    const guard = async () => {
      const current = await raw.request({ method: 'eth_accounts' });
      if (changed || !equal(current?.[0], account) || BigInt(await raw.request({ method: 'eth_chainId' })) !== 8453n) {
        throw new Error('Wallet account or network changed. Stop and review before retrying.');
      }
    };
    const provider = new ethers.BrowserProvider(raw, 'any');
    try {
      await guard();
      const signer = await provider.getSigner(account);
      if (!equal(await signer.getAddress(), account)) throw new Error('Wallet signer does not match the selected account.');
      const token = new ethers.Contract(EDITION.usdc, USDC, signer);
      status('Checking live Canopy token, metadata, 10-USDC price and escrow stock…');
      await inspect(provider, ethers);
      if (await token.balanceOf(account) < EDITION.price) throw new Error('Insufficient Base USDC. One edition costs 10 USDC, plus Base ETH for gas.');
      if (await token.allowance(account, EDITION.escrow) < EDITION.price) {
        await guard();
        status('Approve exactly 10 USDC for the escrow. A separate purchase confirmation follows.');
        const approval = await token.approve(EDITION.escrow, EDITION.price);
        transaction('approval', approval.hash);
        if ((await approval.wait())?.status !== 1) throw new Error('USDC approval did not confirm. No purchase submitted.');
      }
      await guard();
      const { escrow } = await inspect(provider, ethers);
      if (await token.balanceOf(account) < EDITION.price || await token.allowance(account, EDITION.escrow) < EDITION.price) {
        throw new Error('USDC balance or approval changed. No purchase submitted.');
      }
      const sale = escrow.connect(signer);
      await sale.purchaseWithToken.estimateGas(EDITION.listingId, 1n);
      await guard();
      status('Confirm one Canopy edition for 10 USDC plus gas in your wallet.');
      const tx = await sale.purchaseWithToken(EDITION.listingId, 1n);
      transaction('purchase', tx.hash);
      status('Purchase submitted. Waiting for Base confirmation; do not submit again.');
      const receipt = await tx.wait();
      if (receipt?.status !== 1) throw new Error('Purchase did not confirm successfully. Check the transaction before retrying.');
      const found = receipt.logs.filter(log => equal(log.address, EDITION.escrow)).some(log => {
        const parsed = escrow.interface.parseLog(log);
        return parsed?.name === 'Purchased' && parsed.args.listingId === BigInt(EDITION.listingId) && parsed.args.amount === 1n
          && equal(parsed.args.buyer, account) && equal(parsed.args.paymentToken, EDITION.usdc)
          && parsed.args.totalPaid === EDITION.price;
      });
      if (!found) throw new Error('Expected Canopy purchase event not found. Check the transaction before retrying.');
      return { hash: tx.hash, account };
    } finally {
      raw.removeListener?.('accountsChanged', change); raw.removeListener?.('chainChanged', change); provider.destroy();
    }
  }
  function mount() {
    const button = document.getElementById('canopy-supporter-buy');
    const status = document.getElementById('canopy-purchase-status');
    const transactions = document.getElementById('canopy-purchase-transactions');
    const dialog = document.getElementById('canopy-about-dialog');
    if (!button || !status || !transactions) return;
    let busy = false, submitted = false;
    const message = (text, error = false) => { status.textContent = text; status.setAttribute('role', error ? 'alert' : 'status'); };
    const preventClose = event => { if (busy) event.preventDefault(); };
    dialog.addEventListener('cancel', preventClose);
    dialog.addEventListener('click', event => {
      if (busy && (event.target === dialog || event.target.closest('.canopy-about-close'))) {
        event.preventDefault(); event.stopImmediatePropagation();
      }
    }, { capture: true });
    function transaction(stage, hash) {
      if (!/^0x[\da-f]{64}$/i.test(hash || '')) throw new Error('Invalid transaction hash. Check wallet activity before retrying.');
      if (stage === 'purchase') submitted = true;
      const link = document.createElement('a'); link.href = `https://basescan.org/tx/${hash}`;
      link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = `${stage === 'approval' ? 'USDC approval' : 'Canopy purchase'} receipt ↗`;
      const row = document.createElement('p'); row.append(link); transactions.append(row);
    }
    button.addEventListener('click', async () => {
      if (busy || submitted) return;
      if (!root.ethereum?.request) { message('No injected wallet found. Enable a wallet to buy here, or use the Market link.', true); return; }
      if (!root.ethers?.BrowserProvider) { message('Purchase tools unavailable. Reload or use the Market link.', true); return; }
      busy = true; button.disabled = true;
      dialog.querySelectorAll('.canopy-about-close').forEach(b => { b.disabled = true; });
      try {
        await purchase(root.ethereum, root.ethers, { status: message, transaction });
        message('Your Canopy Supporter edition purchase is confirmed on Base. Thank you for supporting the work!');
        button.textContent = 'Purchased';
        root.dispatchEvent(new CustomEvent('decentcanopy:supporter-purchased'));
      } catch (error) {
        console.error('[Canopy Supporter purchase]', error);
        message(`${error.code === 4001 || error.code === 'ACTION_REJECTED' ? 'Wallet request declined.' : error.shortMessage || error.message} ${submitted ? 'A purchase was submitted: check its receipt before any retry.' : 'No purchase confirmation claimed; any completed approval remains in place.'}`, true);
      } finally {
        busy = false; button.disabled = submitted;
        dialog.querySelectorAll('.canopy-about-close').forEach(b => { b.disabled = false; });
      }
    });
  }
  const api = { EDITION, validateListing, inspect, purchase };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.CanopySupporterPurchase = api; root.addEventListener('DOMContentLoaded', mount); }
}(typeof window !== 'undefined' ? window : globalThis));
