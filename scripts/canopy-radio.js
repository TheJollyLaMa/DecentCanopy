(function () {
  'use strict';
  // Pushed PR commit, not a tag/release. Its relative imports share this exact pin.
  const WIDGET_URL = 'https://cdn.jsdelivr.net/gh/A-Decent-Agency/DBuskRadio@269cbe22ae682c226206a0de89375dad7f9a6f6f/widget.js';

  function mountCanopyRadio(element, options = {}) {
    const windowRef = options.window || window;
    const loadWidget = options.loadWidget || (url => import(url));
    let destroyed = false, widget = null, retryButton = null, headerObserver = null, resizeTimer = null;
    const widgetOptions = {
      workerUrl: 'https://decentbusking.onrender.com',
      compact: true, theme: 'auto', volume: 0.08, initialStation: 'wqxr',
      stations: [{ id: 'wqxr', label: 'WQXR', url: 'https://stream.wqxr.org/wqxr-web' }],
      ...(options.head ? { head: options.head } : {}),
    };
    function clearRetry() {
      retryButton?.removeEventListener('click', retry);
      retryButton = null;
    }
    function syncHeaderHeight() {
      if (destroyed) return;
      const header = element.closest?.('.decent-head');
      if (header) element.ownerDocument.documentElement.style.setProperty(
        '--decent-head-height', `${Math.ceil(header.getBoundingClientRect().height)}px`);
    }
    function resized() {
      syncHeaderHeight();
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(syncHeaderHeight, 0);
    }
    async function load() {
      clearRetry();
      element.textContent = 'Loading DBusk radio…';
      try {
        const module = await loadWidget(WIDGET_URL);
        if (destroyed) return;
        if (typeof module.mount !== 'function') throw new Error('DBusk mount export unavailable');
        element.replaceChildren();
        widget = module.mount(element, widgetOptions);
        // Publish the expanded header immediately, before the host's ResizeObserver tick.
        syncHeaderHeight();
        const header = element.closest?.('.decent-head');
        if (header && windowRef.ResizeObserver) {
          headerObserver = new windowRef.ResizeObserver(syncHeaderHeight);
          headerObserver.observe(header);
        }
      } catch (error) {
        if (destroyed) return;
        console.warn('[Canopy radio] Standalone widget unavailable:', error);
        element.textContent = 'DBusk radio unavailable · ';
        retryButton = element.ownerDocument.createElement('button');
        retryButton.type = 'button';
        retryButton.textContent = 'Retry radio';
        retryButton.addEventListener('click', retry);
        element.append(retryButton);
      }
    }
    function retry() { void load(); }
    function destroy() {
      if (destroyed) return;
      destroyed = true;
      clearRetry();
      widget?.destroy();
      headerObserver?.disconnect();
      clearTimeout(resizeTimer);
      windowRef.removeEventListener('pagehide', destroy);
      windowRef.removeEventListener('resize', resized);
      element.replaceChildren();
    }
    windowRef.addEventListener('pagehide', destroy);
    windowRef.addEventListener('resize', resized);
    return { ready: load(), destroy };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { WIDGET_URL, mountCanopyRadio };
  if (typeof document === 'undefined') return;
  let radio;
  function start() {
    const element = document.getElementById('canopy-radio-widget');
    if (!element) return;
    radio?.destroy();
    radio = mountCanopyRadio(element);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
  // Restore the inert control surface when returning from the back-forward cache.
  window.addEventListener('pageshow', event => { if (event.persisted) start(); });
})();
