(function () {
  'use strict';

  const BASE_CHAIN_ID = 8453;
  let wallet = null;

  function shortAddress(address) {
    return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '';
  }

  function publishWalletState(nextWallet) {
    wallet = nextWallet;
    window.decentCanopyWallet = nextWallet;
    window.dispatchEvent(new CustomEvent('decentcanopy:wallet-change', { detail: nextWallet }));

    const button = document.getElementById('wallet-connect-button');
    const label = document.getElementById('wallet-button-label');
    const address = document.getElementById('wallet-address-label');
    if (!button || !label || !address) return;

    button.classList.toggle('connected', Boolean(nextWallet));
    label.textContent = nextWallet ? shortAddress(nextWallet.address) : 'Connect wallet';
    address.textContent = nextWallet
      ? nextWallet.chainId === BASE_CHAIN_ID ? 'Base connected' : `Chain ${nextWallet.chainId}`
      : 'Base · admin';
  }

  function showWalletMessage(message) {
    const status = document.getElementById('wallet-status-message');
    if (status) status.textContent = message;
  }

  async function syncWalletState() {
    if (!window.ethereum) {
      publishWalletState(null);
      return;
    }
    const [accounts, chainHex] = await Promise.all([
      window.ethereum.request({ method: 'eth_accounts' }),
      window.ethereum.request({ method: 'eth_chainId' }),
    ]);
    const address = Array.isArray(accounts) ? accounts[0] : null;
    const chainId = Number.parseInt(chainHex, 16);
    publishWalletState(address ? { address, chainId } : null);
  }

  async function connectWallet() {
    const button = document.getElementById('wallet-connect-button');
    if (!window.ethereum) {
      showWalletMessage('No injected wallet detected. Install or enable your wallet to continue.');
      return;
    }
    if (button) button.disabled = true;
    showWalletMessage('');
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const chainHex = await window.ethereum.request({ method: 'eth_chainId' });
      const address = Array.isArray(accounts) ? accounts[0] : null;
      if (!address) throw new Error('The wallet did not return an account.');
      publishWalletState({ address, chainId: Number.parseInt(chainHex, 16) });
    } catch (error) {
      showWalletMessage(`Wallet connection failed: ${error.message || 'request rejected'}`);
    } finally {
      if (button) button.disabled = false;
    }
  }

  function init() {
    const walletButton = document.getElementById('wallet-connect-button');
    const ipfsButton = document.getElementById('ipfs-status-button');
    const ipfsPopover = document.getElementById('ipfs-status-popover');

    walletButton?.addEventListener('click', connectWallet);
    ipfsButton?.addEventListener('click', () => {
      if (!ipfsButton || !ipfsPopover) return;
      const expanded = ipfsButton.getAttribute('aria-expanded') === 'true';
      ipfsButton.setAttribute('aria-expanded', String(!expanded));
      ipfsPopover.hidden = expanded;
    });
    document.addEventListener('click', event => {
      if (!ipfsButton || !ipfsPopover || event.composedPath().includes(ipfsButton) || event.composedPath().includes(ipfsPopover)) return;
      ipfsPopover.hidden = true;
      ipfsButton.setAttribute('aria-expanded', 'false');
    });
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !ipfsButton || !ipfsPopover) return;
      ipfsPopover.hidden = true;
      ipfsButton.setAttribute('aria-expanded', 'false');
    });

    if (window.ethereum?.on) {
      window.ethereum.on('accountsChanged', accounts => {
        const address = Array.isArray(accounts) ? accounts[0] : null;
        publishWalletState(address ? { address, chainId: wallet?.chainId || 0 } : null);
      });
      window.ethereum.on('chainChanged', chainHex => {
        const chainId = Number.parseInt(chainHex, 16);
        publishWalletState(wallet ? { ...wallet, chainId } : null);
      });
    }

    syncWalletState().catch(error => {
      showWalletMessage(`Could not read wallet state: ${error.message || 'provider error'}`);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}());
