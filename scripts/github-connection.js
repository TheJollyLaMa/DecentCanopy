(function (root) {
  'use strict';
  const Records = typeof module !== 'undefined' && module.exports ? require('./creator-records') : root.DecentCreatorRecords;
  function create({ relay, fetchImpl = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now }) {
    const base = new URL(relay);
    if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(base.hostname))) throw new Error('GitHub relay must use HTTPS.');
    if (base.username || base.password || base.search || base.hash) throw new Error('Invalid GitHub relay URL.');
    let session = null, closed = false;
    async function request(path, method = 'GET') {
      const response = await fetchImpl(new URL(path, base).href, {
        method, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', redirect: 'error',
        headers: session ? { Authorization: `Bearer ${session}` } : {},
        signal: AbortSignal.timeout(75000)
      });
      const body = await response.json();
      if (!response.ok) {
        const error = new Error(body.error || `GitHub connector failed (HTTP ${response.status}).`);
        error.statusCode = response.status;
        throw error;
      }
      return body;
    }
    async function disconnect() {
      closed = true;
      if (session) {
        try { await request('/github/session', 'DELETE'); }
        finally { session = null; }
      }
    }
    async function connect(popup) {
      if (!popup) throw new Error('Allow popups for Canopy, then click GitHub sign-in again.');
      closed = false;
      session = null;
      try {
        const result = await request('/github/connect', 'POST');
        if (!/^[a-f0-9]{64}$/.test(result.session || '')) throw new Error('GitHub connector returned an invalid session.');
        session = result.session;
        if (closed) throw new Error('GitHub sign-in cancelled.');
        const authorize = new URL(result.authorizeUrl);
        if (authorize.origin !== base.origin || authorize.pathname !== '/github/start') throw new Error('GitHub connector returned an invalid sign-in URL.');
        popup.location = authorize.href;
        const deadline = now() + 10 * 60 * 1000;
        while (now() < deadline && !closed) {
          const state = await request('/github/session');
          if (closed) throw new Error('GitHub sign-in cancelled.');
          if (state.status === 'ready' && /^[a-z0-9][a-z0-9-]{0,38}$/i.test(state.login || '')) {
            popup.close();
            return state.login;
          }
          if (state.status === 'error') throw new Error(state.error || 'GitHub sign-in failed.');
          if (popup.closed) throw new Error('GitHub sign-in window closed. Nothing was published.');
          await sleep(1500);
        }
        throw new Error('GitHub sign-in cancelled or expired. Please sign in again.');
      } catch (error) {
        popup.close();
        try { await disconnect(); }
        catch (cleanup) { console.error('[Canopy GitHub] Disconnect failed.', cleanup.message); }
        throw error;
      }
    }
    async function repositories(page = 1) {
      if (closed || !session) throw new Error('Sign in to GitHub first.');
      let result;
      try {
        result = await request(`/github/repos?page=${page}`);
      } catch (error) {
        if (error.statusCode === 401) {
          session = null;
          closed = true;
          error.message = 'GitHub authorization was revoked or expired. Sign in again.';
        }
        throw error;
      }
      if (!Array.isArray(result.repositories) || !(result.nextPage === null || result.nextPage === page + 1)) throw new Error('GitHub returned an invalid repository page.');
      const repositories = result.repositories.map(repo => {
        const url = Records.repository(repo.url);
        if (repo.visibility !== 'public' || typeof repo.fullName !== 'string' ||
            url !== `https://github.com/${repo.fullName.toLowerCase()}` || !Number.isFinite(Date.parse(repo.checkedAt))) throw new Error('GitHub returned invalid public repository metadata.');
        return { url, fullName: repo.fullName, checkedAt: repo.checkedAt };
      });
      return { repositories, nextPage: result.nextPage };
    }
    return { connect, repositories, disconnect };
  }
  const api = { create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CanopyGitHubConnection = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
