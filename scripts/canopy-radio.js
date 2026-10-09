/* global DecentCreatorRecords */
(function () {
  'use strict';
  // Mirrors the Rabbit Hole stations without introducing a dependency into its standalone IPFS page.
  const CLASSICAL = 'https://stream.wqxr.org/wqxr-web';
  const JUKELOOP = 'https://decentbusking.onrender.com/api/radio';
  const GATEWAY = 'https://gateway.pinata.cloud/ipfs/';
  document.addEventListener('DOMContentLoaded', () => {
    const byId = id => document.getElementById(id);
    const audio = byId('canopy-radio-audio'), play = byId('canopy-radio-play');
    const stationButton = byId('canopy-radio-station'), volume = byId('canopy-radio-volume'), status = byId('canopy-radio-status');
    let station = 'wqxr', listening = false, token = 0, timer = null, request = null, track = null, metadata = null;
    let classicalRetries = 0, classicalRetryPending = false;
    function announce(text, error = false) {
      status.textContent = text;
      status.title = text;
      status.classList.toggle('is-error', error);
    }
    function render() {
      play.textContent = listening ? 'Ⅱ' : '▶';
      play.setAttribute('aria-pressed', String(listening));
      play.setAttribute('aria-label', `${listening ? 'Pause' : 'Play'} ${station === 'wqxr' ? 'WQXR classical' : 'DecentBusking'} radio`);
      stationButton.textContent = station === 'wqxr' ? '🎼 WQXR' : '🎸 DecentBusking';
      const next = station === 'wqxr' ? 'DecentBusking' : 'WQXR classical';
      stationButton.setAttribute('aria-label', `Switch to ${next} radio`);
      stationButton.title = `Switch to ${next}`;
    }
    function clearMetadata() {
      if (metadata) audio.removeEventListener('loadedmetadata', metadata);
      metadata = null;
    }
    function stop() {
      token++;
      clearTimeout(timer);
      classicalRetryPending = false;
      request?.abort();
      request = null;
      clearMetadata();
      track = null;
      listening = false;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      render();
    }
    function playbackError(error, current) {
      if (current !== token || !listening) return;
      console.warn('[Canopy radio] Playback failed:', error);
      if (station === 'wqxr' && error.name !== 'NotAllowedError' && error.name !== 'AbortError'
        && classicalRetries < 2) {
        if (classicalRetryPending) return;
        classicalRetryPending = true;
        classicalRetries++;
        // A failed media request may reject play() as well as emitting error.
        token++;
        const retryToken = token;
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        announce(`WQXR stream interrupted · retrying ${classicalRetries}/2…`, true);
        timer = setTimeout(() => {
          if (retryToken !== token || !listening || station !== 'wqxr') return;
          classicalRetryPending = false;
          tuneClassical(retryToken);
        }, classicalRetries * 1500);
        return;
      }
      stop();
      announce(error.name === 'NotAllowedError' ? 'Tap ▶ to listen · autoplay blocked' : 'Radio unavailable · tap ▶ to retry', true);
    }
    async function playAudio(current) {
      try { await audio.play(); }
      catch (error) { playbackError(error, current); }
    }
    function tuneClassical(current) {
      audio.loop = false;
      audio.src = CLASSICAL;
      announce(classicalRetries ? `Reconnecting to WQXR · attempt ${classicalRetries}/2…` : 'Tuning in to WQXR…');
      void playAudio(current);
    }
    function schedule(current, delay = 8000) {
      if (current === token && listening && station === 'busking') timer = setTimeout(() => poll(current), delay);
    }
    async function poll(current) {
      if (current !== token || !listening) return;
      clearTimeout(timer);
      const controller = new AbortController();
      request = controller;
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch(JUKELOOP, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(`JukeLoop returned HTTP ${response.status}.`);
        const state = await response.json();
        if (current !== token || !listening) return;
        if (!state || typeof state !== 'object' || !Object.hasOwn(state, 'nowPlaying')) throw new Error('Invalid JukeLoop radio state.');
        const now = state.nowPlaying;
        if (!now) {
          clearMetadata();
          track = null;
          audio.pause();
          announce('JukeLoop · between tracks');
        } else {
          const title = String(now.title || 'Untitled').slice(0, 120), artist = String(now.uploader || '').slice(0, 60);
          const label = `${title}${artist ? ` — ${artist}` : ''}`;
          const cid = typeof now.ipfsCid === 'string' && DecentCreatorRecords.CID.test(now.ipfsCid) ? now.ipfsCid : null;
          const position = Number.isFinite(now.positionMs) ? Math.max(0, now.positionMs) / 1000 : 0;
          if (!cid) {
            clearMetadata();
            track = null;
            audio.pause();
            announce(`${label} · not on IPFS yet`);
          } else {
            const id = `${String(now.playId || cid)}:${cid}`;
            announce(label);
            if (track !== id) {
              clearMetadata();
              audio.pause();
              track = id;
              audio.loop = false;
              audio.src = GATEWAY + cid;
              const started = Date.now();
              metadata = () => {
                metadata = null;
                if (current !== token || track !== id) return;
                const livePosition = position + (Date.now() - started) / 1000;
                if (Number.isFinite(audio.duration) && livePosition < audio.duration - 2) audio.currentTime = livePosition;
              };
              audio.addEventListener('loadedmetadata', metadata, { once: true });
              void playAudio(current);
            } else if (audio.ended) {
              announce('JukeLoop · waiting for the next track');
            } else if (!audio.paused && Number.isFinite(audio.duration) && Math.abs(audio.currentTime - position) > 8 && position < audio.duration - 2) {
              audio.currentTime = position;
            }
          }
        }
      } catch (error) {
        if (current !== token || !listening) return;
        console.warn('[Canopy radio] JukeLoop unavailable:', error);
        clearMetadata();
        audio.pause();
        track = null;
        announce('JukeLoop unavailable · retrying…', true);
      } finally {
        clearTimeout(timeout);
        if (request === controller) request = null;
        schedule(current);
      }
    }
    function start() {
      stop();
      classicalRetries = 0;
      listening = true;
      audio.volume = Number(volume.value);
      render();
      const current = token;
      if (station === 'busking') {
        announce('Tuning in to JukeLoop…');
        void poll(current);
      } else {
        tuneClassical(current);
      }
    }
    play.addEventListener('click', () => {
      if (listening) { stop(); announce('Radio paused'); }
      else start();
    });
    stationButton.addEventListener('click', () => {
      stop();
      station = station === 'wqxr' ? 'busking' : 'wqxr';
      start();
    });
    volume.addEventListener('input', () => {
      audio.volume = Number(volume.value);
      volume.title = `Radio volume: ${Math.round(audio.volume * 100)}%`;
    });
    audio.addEventListener('error', () => {
      if (listening && !classicalRetryPending) playbackError(new Error(`Audio stream failed (${audio.error?.code || 'unknown'}).`), token);
    });
    audio.addEventListener('playing', () => {
      if (listening && station === 'wqxr' && !classicalRetryPending) announce('WQXR classical · quiet');
    });
    audio.addEventListener('ended', () => {
      if (listening && station === 'wqxr') {
        playbackError(new Error('WQXR live stream ended.'), token);
        return;
      }
      if (listening && station === 'busking') {
        clearTimeout(timer);
        if (!request) schedule(token, 1500);
      }
    });
    window.addEventListener('pagehide', stop);
    start();
  });
}());
