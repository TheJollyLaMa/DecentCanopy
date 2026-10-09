(function (root) {
  'use strict';
  const BUNDLED = {
    bafkreicdvtxkjiz36nfiulfs47shwx6fgp5i7n5l3dnyhv5pd7mbs3hmie: 'assets/bafkreicdvtxkjiz36nfiulfs47shwx6fgp5i7n5l3dnyhv5pd7mbs3hmie.png',
  };
  function imageUrl(value) {
    let url;
    try { url = new URL(value); } catch { return value; }
    if (url.protocol !== 'https:' || url.username || url.password) return value;
    const pathGateways = ['ipfs.io', 'dweb.link', 'gateway.pinata.cloud', 'w3s.link'];
    let cid;
    if (pathGateways.includes(url.hostname)) cid = /^\/ipfs\/(baf[a-z2-7]+)\/?$/.exec(url.pathname)?.[1];
    else if (url.pathname === '/') cid = /^(baf[a-z2-7]+)\.ipfs\.(?:dweb\.link|w3s\.link|inbrowser\.link)$/.exec(url.hostname)?.[1];
    return BUNDLED[cid] || value;
  }
  const api = { imageUrl, BUNDLED };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.DecentCreatorImages = api;
    document.addEventListener('error', event => {
      const image = event.target;
      if (!(image instanceof HTMLImageElement) || !image.hasAttribute('data-creator-image')) return;
      console.warn('[Decent Creator image] Image could not be loaded:', image.src);
      image.hidden = true;
      const notice = document.createElement('span');
      notice.className = 'creator-image-unavailable';
      notice.textContent = 'Artwork unavailable';
      notice.setAttribute('role', 'status');
      image.after(notice);
    }, true);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
