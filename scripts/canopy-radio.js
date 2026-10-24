(function () {
  'use strict';
  // Pushed PR commit, not a tag/release. Its relative imports share this exact pin.
  const WIDGET_URL = 'https://cdn.jsdelivr.net/gh/A-Decent-Agency/DBuskRadio@ab0d487b8e12cfb51e256363b00c15915c18cc2a/widget.js';

  // Presentation only: all audio, state, votes and subscriptions belong to the widget.
  function renderCanopyRadio({ element, document, controls, selectStation }) {
    const make = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text) node.textContent = text;
      return node;
    };
    const row = make('div', 'canopy-radio-controls');
    const station = make('button', '', '🎼 WQXR');
    station.id = 'canopy-radio-station';
    station.type = 'button';
    controls.play.id = 'canopy-radio-play';
    controls.play.title = 'Play / pause radio';
    controls.volume.id = 'canopy-radio-volume';
    controls.audio.id = 'canopy-radio-audio';
    const status = make('button', 'canopy-radio-status', 'Classical · quiet');
    status.type = 'button';
    status.id = 'canopy-radio-status';
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-expanded', 'false');
    status.setAttribute('aria-controls', 'canopy-radio-details');
    const details = make('div', 'canopy-radio-details');
    details.id = 'canopy-radio-details';
    details.hidden = true;
    details.setAttribute('role', 'region');
    details.setAttribute('aria-label', 'Radio details and voting');
    const votes = make('div', 'canopy-radio-controls');
    const close = make('button', '', 'Close radio details');
    close.type = 'button';
    votes.append(controls.up, controls.down, controls.net);
    details.append(controls.now, votes, controls.status, controls.session, close);
    row.append(controls.play, station, controls.volume);
    element.replaceChildren(row, status, details, controls.audio);
    const toggleDetails = () => {
      details.hidden = !details.hidden;
      status.setAttribute('aria-expanded', String(!details.hidden));
    };
    const closeDetails = () => {
      details.hidden = true;
      status.setAttribute('aria-expanded', 'false');
      status.focus();
    };
    let selected = 'wqxr';
    const switchStation = () => selectStation(selected === 'wqxr' ? 'dbusk' : 'wqxr', { play: true });
    const volumeTitle = () => { controls.volume.title = `Radio volume: ${Math.round(Number(controls.volume.value) * 100)}%`; };
    const keydown = event => { if (event.key === 'Escape' && !details.hidden) closeDetails(); };
    station.addEventListener('click', switchStation);
    status.addEventListener('click', toggleDetails);
    close.addEventListener('click', closeDetails);
    element.addEventListener('keydown', keydown);
    controls.volume.addEventListener('input', volumeTitle);
    volumeTitle();
    return {
      update(state) {
        selected = state.station.id;
        const classical = selected === 'wqxr';
        const next = classical ? 'DecentBusking' : 'WQXR classical';
        station.textContent = classical ? '🎼 WQXR' : '🎸 DecentBusking';
        station.setAttribute('aria-label', `Switch to ${next} radio`);
        station.title = `Switch to ${next}`;
        controls.play.setAttribute('aria-label', `${state.listening ? 'Pause' : 'Play'} ${classical ? 'WQXR classical' : 'DecentBusking'} radio`);
        const label = state.status || (classical ? 'Classical · quiet' : state.now);
        status.textContent = label;
        status.title = `${label} · Click for radio details and voting`;
        status.setAttribute('aria-label', `${label} · Radio details and voting`);
        status.classList.toggle('is-error', /unavailable|blocked|not recorded/i.test(label));
      },
      destroy() {
        station.removeEventListener('click', switchStation);
        status.removeEventListener('click', toggleDetails);
        close.removeEventListener('click', closeDetails);
        element.removeEventListener('keydown', keydown);
        controls.volume.removeEventListener('input', volumeTitle);
      },
    };
  }

  function mountCanopyRadio(element, options = {}) {
    const windowRef = options.window || window;
    const loadWidget = options.loadWidget || (url => import(url));
    let destroyed = false, widget = null, retryButton = null;
    const widgetOptions = {
      workerUrl: 'https://decentbusking.onrender.com',
      compact: true, theme: 'auto', volume: 0.08, initialStation: 'wqxr',
      stations: [{ id: 'wqxr', label: 'WQXR', url: 'https://stream.wqxr.org/wqxr-web' }],
      render: renderCanopyRadio,
      ...(options.head ? { head: options.head } : {}),
    };
    function clearRetry() {
      retryButton?.removeEventListener('click', retry);
      retryButton = null;
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
      windowRef.removeEventListener('pagehide', destroy);
      element.replaceChildren();
    }
    windowRef.addEventListener('pagehide', destroy);
    return { ready: load(), destroy };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { WIDGET_URL, mountCanopyRadio, renderCanopyRadio };
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
