(function () {
  'use strict';

  const BASE_CHAIN_ID = 8453;
  const BACKUP_MANIFEST_URL = 'https://raw.githubusercontent.com/TheJollyLaMa/DecentCanopy/main/data/ipfs-backup.json';
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
    label.textContent = nextWallet ? 'Wallet connected' : 'Connect wallet';
    address.textContent = nextWallet
      ? `${shortAddress(nextWallet.address)} · ${nextWallet.chainId === BASE_CHAIN_ID ? 'Base' : `Chain ${nextWallet.chainId}`}`
      : 'Not connected';
    address.title = nextWallet ? nextWallet.address : 'No wallet connected';
    button.setAttribute('aria-label', nextWallet
      ? `Wallet connected: ${nextWallet.address}`
      : 'Connect wallet using MetaMask');
  }

  function showWalletMessage(message) {
    const status = document.getElementById('wallet-status-message');
    if (status) status.textContent = message;
  }

  async function loadIpfsBackupStatus() {
    const status = document.getElementById('ipfs-backup-status');
    const stateLabel = document.getElementById('ipfs-state-label');
    if (!status) return;
    try {
      const manifestUrl = ['localhost', '127.0.0.1'].includes(window.location.hostname)
        ? 'data/ipfs-backup.json'
        : BACKUP_MANIFEST_URL;
      const response = await fetch(`${manifestUrl}?t=${Date.now()}`, { cache: 'no-store' });
      if (response.status === 404) {
        status.textContent = 'No IPFS backup has been published yet. Add the PINATA_JWT repository secret to enable automatic backups.';
        if (stateLabel) stateLabel.textContent = 'not pinned';
        return;
      }
      if (!response.ok) throw new Error(`Backup manifest request failed with HTTP ${response.status}.`);
      const manifest = await response.json();
      if (manifest.status === 'not-yet-pinned') {
        status.textContent = 'No IPFS backup has been published yet. Add the PINATA_JWT repository secret to enable automatic backups.';
        if (stateLabel) stateLabel.textContent = 'not pinned';
        return;
      }
      if (typeof manifest.cid !== 'string' || !/^[A-Za-z0-9]{20,120}$/.test(manifest.cid)) {
        throw new Error('The backup manifest does not contain a valid content identifier.');
      }
      const date = new Date(manifest.pinnedAt);
      if (Number.isNaN(date.getTime())) throw new Error('The backup manifest has an invalid pin date.');
      status.replaceChildren(
        document.createTextNode(`Canopy data backed up ${date.toLocaleString()}. `)
      );
      const link = document.createElement('a');
      link.href = `https://gateway.pinata.cloud/ipfs/${manifest.cid}`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Open IPFS backup ↗';
      status.appendChild(link);
      if (stateLabel) stateLabel.textContent = 'pinned';
      window.decentCanopyIpfsManifest = manifest;
      window.dispatchEvent(new CustomEvent('decentcanopy:ipfs-manifest', { detail: manifest }));
    } catch (error) {
      status.textContent = `Could not check IPFS backup status: ${error.message}`;
      if (stateLabel) stateLabel.textContent = 'unavailable';
    }
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

  function linePathsWithTrees(scene) {
    if (!scene) return;
    const trails = scene.querySelector('.canopy-trails');
    const trees = scene.querySelectorAll('.header-forest .forest-tree');
    if (!trails || !trees.length) return;

    const paths = trails.querySelectorAll('path');
    if (!paths.length) return;
    const viewBox = trails.viewBox.baseVal;
    trees.forEach((tree, index) => {
      const path = paths[index % paths.length];
      const fraction = trees.length === 1 ? 0.5 : 0.14 + 0.72 * index / (trees.length - 1);
      const point = path.getPointAtLength(path.getTotalLength() * fraction);
      tree.style.left = `${100 * (point.x - viewBox.x) / viewBox.width}%`;
      tree.style.top = `${100 * (point.y - viewBox.y) / viewBox.height}%`;
    });
  }

  function animateCanopyCritters(header, dialog) {
    if (!header) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const animations = [];
    const movement = {
      squirrel: { speed: 95, pause: 0.9, lift: 9, bounce: 4 },
      fox: { speed: 75, pause: 1.3, lift: 0, bounce: 2 },
      bird: { speed: 130, pause: 1.6, lift: 14, bounce: 2 },
      butterfly: { speed: 55, pause: 0.7, lift: 8, bounce: 5 },
      owl: { speed: 85, pause: 2.8, lift: 10, bounce: 1 },
    };

    function refreshRoutes() {
      animations.splice(0).forEach(animation => animation.cancel());
      if (dialog && !dialog.open) return;
      header.querySelectorAll('.canopy-critter, .dock-critter').forEach((critter, index) => {
        const dock = critter.closest('.header-control-dock');
        const container = dock || header.querySelector('.canopy-critters');
        const trees = [...(dock || header).querySelectorAll(dock ? '.dock-tree' : '.forest-tree')];
        const bounds = container.getBoundingClientRect();
        const size = { width: critter.offsetWidth, height: critter.offsetHeight };
        const points = trees.map(tree => {
          const rect = tree.getBoundingClientRect();
          return {
            x: rect.left + rect.width / 2 - bounds.left - size.width / 2,
            y: Math.max(1, rect.top + rect.height * 0.35 - bounds.top - size.height / 2),
          };
        }).sort((a, b) => a.x - b.x);
        if (points.length < 2) return;
        const species = Object.keys(movement).find(name => critter.classList.contains(`critter-${name}`)
          || critter.classList.contains(`dock-critter-${name}`));
        const profile = movement[species];
        const route = [...points, ...points.slice(1, -1).reverse(), points[0]];
        const frames = [];
        let elapsed = 0;
        function addFrame(point, tilt = 0, facing = 1) {
          frames.push({
            transform: `translate(${point.x}px, ${point.y}px) rotate(${tilt}deg) scaleX(${facing})`,
            offset: elapsed,
          });
        }
        route.slice(0, -1).forEach((start, step) => {
          const end = route[step + 1];
          const facing = end.x >= start.x ? 1 : -1;
          addFrame(start, 0, facing);
          elapsed += profile.pause;
          addFrame(start, 0, facing);
          const travel = Math.max(0.7, Math.hypot(end.x - start.x, end.y - start.y) / profile.speed);
          for (let sample = 1; sample <= 16; sample++) {
            const t = sample / 16;
            const arc = Math.sin(Math.PI * t);
            const bounce = Math.sin(t * Math.PI * (species === 'butterfly' ? 6 : 8));
            elapsed += travel / 16;
            addFrame({
              x: start.x + (end.x - start.x) * t,
              y: Math.max(1, start.y + (end.y - start.y) * t
                - arc * profile.lift - Math.abs(bounce) * profile.bounce * arc),
            }, bounce * arc * (species === 'butterfly' ? 12 : 4), facing);
          }
        });
        frames.push({ ...frames[0], offset: elapsed });
        frames.forEach(frame => { frame.offset /= elapsed; });
        critter.style.transform = frames[0].transform;
        if (reducedMotion.matches) return;
        const animation = critter.animate(frames, {
          duration: elapsed * 1000,
          iterations: Infinity,
          easing: 'linear',
        });
        animation.currentTime = elapsed * 1000 * index / 9;
        animations.push(animation);
      });
    }

    new ResizeObserver(refreshRoutes).observe(header);
    reducedMotion.addEventListener('change', refreshRoutes);
    refreshRoutes();
    return refreshRoutes;
  }

  function init() {
    const walletButton = document.getElementById('wallet-connect-button');
    const ipfsButton = document.getElementById('ipfs-status-button');
    const ipfsPopover = document.getElementById('ipfs-status-popover');
    const aboutButton = document.getElementById('decent-head-about-button');
    const aboutDialog = document.getElementById('canopy-about-dialog');

    const header = document.querySelector('.decent-head');
    if (header) {
      const publishHeight = () => document.documentElement.style.setProperty(
        '--decent-head-height', `${Math.ceil(header.getBoundingClientRect().height)}px`);
      publishHeight();
      if ('ResizeObserver' in window) new ResizeObserver(publishHeight).observe(header);
      else window.addEventListener('resize', publishHeight);
    }
    const aboutScene = document.querySelector('.about-forest-scene');
    linePathsWithTrees(header);
    linePathsWithTrees(aboutScene);
    animateCanopyCritters(header);
    const refreshAboutRoutes = animateCanopyCritters(aboutScene, aboutDialog);
    loadIpfsBackupStatus();
    walletButton?.addEventListener('click', connectWallet);
    aboutButton?.addEventListener('click', () => {
      aboutDialog?.showModal();
      refreshAboutRoutes?.();
    });
    aboutDialog?.addEventListener('close', () => refreshAboutRoutes?.());
    aboutDialog?.addEventListener('animationend', event => {
      if (event.target === aboutDialog && event.animationName === 'canopy-dialog-in') refreshAboutRoutes?.();
    });
    aboutDialog?.addEventListener('click', event => {
      if (event.target === aboutDialog) aboutDialog.close();
    });
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
