(function (root) {
  'use strict';
  const KEYS = ['q', 'entity', 'fund', 'track', 'status', 'focus', 'lines', 'details', 'x', 'y', 'z'];
  function read(url) {
    const params = new URL(url).searchParams;
    if (!params.has('view')) return null;
    if (params.get('view') !== '1') throw new Error('This shared view version is not supported.');
    const state = {};
    for (const key of KEYS) {
      const value = params.get(key);
      if (value === null) continue;
      if (value.length > (key === 'q' ? 500 : 255)) throw new Error('Shared view contains an oversized value.');
      if (['focus', 'lines', 'details'].includes(key)) {
        if (!['0', '1'].includes(value)) throw new Error('Invalid shared view toggle.');
        state[key] = value === '1';
      } else if (['x', 'y', 'z'].includes(key)) {
        if (!value.trim() || !Number.isFinite(Number(value))) throw new Error('Invalid shared view camera.');
        state[key] = Number(value);
      } else state[key] = value;
    }
    if (['x', 'y', 'z'].some(key => key in state)) {
      if (!['x', 'y', 'z'].every(key => key in state) || Math.abs(state.x) > 1e7 || Math.abs(state.y) > 1e7
        || state.z < .35 || state.z > 8) throw new Error('Shared view camera is out of range.');
    }
    return state;
  }
  function create(base, state) {
    const url = new URL(base);
    const context = ['canopy', 'mode'].map(key => [key, url.searchParams.get(key)]);
    url.search = ''; url.hash = '';
    context.forEach(([key, value]) => { if (value) url.searchParams.set(key, value); });
    url.searchParams.set('view', '1');
    for (const key of KEYS) {
      const value = state[key];
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, typeof value === 'boolean' ? (value ? '1' : '0') : String(value));
      }
    }
    read(url.href);
    return url.href;
  }
  const api = { create, read };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CanopyShareView = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
