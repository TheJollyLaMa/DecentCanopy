'use strict';
const { randomBytes } = require('node:crypto');
const Records = require('../scripts/creator-records');
const TTL = 10 * 60 * 1000;
const random = () => randomBytes(32).toString('hex');

function createGitHubOAuth({ clientId, clientSecret, callbackUrl, fetchImpl = fetch, now = Date.now, allowed, limited }) {
  const configured = Boolean(clientId && clientSecret && callbackUrl);
  if (configured) {
    const url = new URL(callbackUrl);
    if (url.pathname !== '/github/callback' || url.search || url.hash ||
        url.username || url.password || (url.protocol !== 'https:' &&
          !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) {
      throw new Error('GITHUB_OAUTH_CALLBACK_URL must be an HTTPS /github/callback URL (HTTP allowed only on localhost).');
    }
  }
  const sessions = new Map(), states = new Map();
  const fail = (status, message) => Object.assign(new Error(message), { statusCode: status });
  async function revoke(token) {
    const response = await fetchImpl(`https://api.github.com/applications/${clientId}/token`, {
      method: 'DELETE',
      headers: { Accept: 'application/vnd.github+json', 'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}` },
      body: JSON.stringify({ access_token: token }), signal: AbortSignal.timeout(10000)
    });
    if (!response.ok && response.status !== 404) throw fail(502, 'GitHub could not revoke this connection. Revoke DecentCanopy in GitHub Settings → Applications.');
  }
  function remove(session) {
    clearTimeout(session.timer);
    sessions.delete(session.id);
    states.delete(session.state);
    const token = session.token;
    session.token = null;
    return token;
  }
  function expire() {
    for (const session of sessions.values()) if (now() >= session.expiresAt) {
      const token = remove(session);
      if (token) revoke(token).catch(() => console.error('[Canopy GitHub] Expired token revocation failed; revoke the app in GitHub Settings.'));
    }
  }
  async function api(path, token) {
    const response = await fetchImpl(`https://api.github.com${path}`, {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28' },
      redirect: 'error', signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw fail(response.status === 401 ? 401 : 502,
      `GitHub request failed (HTTP ${response.status}). Reconnect if access was revoked, or retry after a rate limit.`);
    const scopes = response.headers.get('x-oauth-scopes');
    if (scopes?.trim()) throw fail(403, 'This app has broader permissions than expected. Revoke it in GitHub Settings and reconnect with no scopes.');
    return response;
  }
  async function handle(req, res, url) {
    if (!url.pathname.startsWith('/github/')) return false;
    expire();
    const origin = req.headers.origin;
    const send = (status, body, extra = {}) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer', ...(allowed(origin) ? {
          'Access-Control-Allow-Origin': origin, Vary: 'Origin'
        } : {}), ...extra });
      res.end(JSON.stringify(body));
      return true;
    };
    const page = (message, cookie) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
        ...(cookie ? { 'Set-Cookie': cookie } : {}) });
      res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Canopy GitHub connection</title><p>${message}</p><p>You can close this window and return to DecentCanopy.</p></html>`);
      return true;
    };
    if (req.method === 'GET' && url.pathname === '/github/status') return send(200, { configured });
    if (!configured) return send(503, { error: 'GitHub sign-in is not configured yet. Public repository URLs still work.' });
    try {
      if (req.method === 'GET' && url.pathname === '/github/start') {
        const session = states.get(url.searchParams.get('state'));
        if (!session || session.started) throw fail(400, 'This sign-in link expired or was already used. Start again in Canopy.');
        session.started = true;
        const authorize = new URL('https://github.com/login/oauth/authorize');
        authorize.search = new URLSearchParams({ client_id: clientId, redirect_uri: callbackUrl,
          scope: '', state: session.state, allow_signup: 'false' });
        const secure = callbackUrl.startsWith('https:') ? '; Secure' : '';
        res.writeHead(302, { Location: authorize.href, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
          'Set-Cookie': `canopy-gh-${session.state}=${session.binding}; Path=/github; HttpOnly; SameSite=Lax; Max-Age=600${secure}` });
        res.end();
        return true;
      }
      if (req.method === 'GET' && url.pathname === '/github/callback') {
        const session = states.get(url.searchParams.get('state'));
        if (!session || !session.started || !String(req.headers.cookie || '').split(';').some(
          cookie => cookie.trim() === `canopy-gh-${session.state}=${session.binding}`)) {
          throw fail(400, 'GitHub sign-in state is invalid or expired. Start again in Canopy.');
        }
        states.delete(session.state);
        const clearCookie = `canopy-gh-${session.state}=; Path=/github; HttpOnly; SameSite=Lax; Max-Age=0${callbackUrl.startsWith('https:') ? '; Secure' : ''}`;
        let token;
        try {
          if (url.searchParams.has('error')) throw fail(400, 'GitHub authorization was cancelled or denied. Nothing was published.');
          const code = url.searchParams.get('code');
          if (!code || code.length > 512) throw fail(400, 'GitHub did not return a valid authorization code.');
          const response = await fetchImpl('https://github.com/login/oauth/access_token', {
            method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: callbackUrl }),
            redirect: 'error', signal: AbortSignal.timeout(15000)
          });
          if (!response.ok) throw fail(502, `GitHub token exchange failed (HTTP ${response.status}).`);
          const value = await response.json();
          token = value.access_token;
          if (typeof token !== 'string' || !token || value.token_type !== 'bearer') throw fail(502, 'GitHub did not authorize this connection.');
          if (typeof value.scope !== 'string' || value.scope.trim()) throw fail(403, 'GitHub returned broader permissions than requested. Revoke the app in GitHub Settings and reconnect.');
          const user = await (await api('/user', token)).json();
          if (!/^[a-z0-9][a-z0-9-]{0,38}$/i.test(user.login || '') || !Number.isSafeInteger(user.id)) throw fail(502, 'GitHub returned an invalid account identity.');
          if (!sessions.has(session.id) || now() >= session.expiresAt) throw fail(410, 'This connection was closed or expired. Sign in again.');
          session.token = token;
          session.login = user.login;
          session.status = 'ready';
          token = null;
          return page('GitHub sign-in succeeded. Return to Canopy to choose public repositories. Nothing has been published.', clearCookie);
        } catch (error) {
          session.status = 'error';
          session.error = error.statusCode ? error.message : 'GitHub sign-in failed. Please try again.';
          console.error('[Canopy GitHub] Authorization failed.', error.statusCode || 502);
          if (token) await revoke(token).catch(() => console.error('[Canopy GitHub] Token cleanup failed; revoke the app in GitHub Settings.'));
          return page('GitHub sign-in was not completed. Return to Canopy for details.', clearCookie);
        }
      }
      if (!allowed(origin)) throw fail(403, 'An allowed Canopy Origin header is required.');
      if (req.method === 'POST' && url.pathname === '/github/connect') {
        const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
        if (limited(`github:${ip}`, 10) || sessions.size >= 500) throw fail(429, 'Too many GitHub sign-in attempts. Please try later.');
        const session = { id: random(), state: random(), binding: random(), origin,
          expiresAt: now() + TTL, status: 'pending', started: false, token: null };
        session.timer = setTimeout(() => {
          const token = remove(session);
          if (token) revoke(token).catch(() => console.error('[Canopy GitHub] Expired token revocation failed; revoke the app in GitHub Settings.'));
        }, TTL);
        session.timer.unref();
        sessions.set(session.id, session);
        states.set(session.state, session);
        return send(201, { session: session.id, authorizeUrl: new URL(`/github/start?state=${session.state}`, callbackUrl).href,
          expiresAt: new Date(session.expiresAt).toISOString() });
      }
      const id = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '')?.[1];
      const session = sessions.get(id);
      if (!session || session.origin !== origin) throw fail(401, 'GitHub connection expired or disconnected. Sign in again.');
      if (req.method === 'DELETE' && url.pathname === '/github/session') {
        const token = remove(session);
        if (token) await revoke(token);
        return send(200, { disconnected: true });
      }
      if (req.method === 'GET' && url.pathname === '/github/session') {
        return send(200, { status: session.status, login: session.login, error: session.error,
          expiresAt: new Date(session.expiresAt).toISOString() });
      }
      if (req.method === 'GET' && url.pathname === '/github/repos') {
        if (session.status !== 'ready') throw fail(409, 'Finish GitHub sign-in first.');
        const number = url.searchParams.get('page') || '1';
        if (!/^[1-9]\d{0,5}$/.test(number)) throw fail(400, 'Invalid repository page.');
        let response;
        try {
          response = await api(`/user/repos?visibility=public&affiliation=owner,collaborator,organization_member&sort=full_name&per_page=100&page=${number}`, session.token);
        } catch (error) {
          if (error.statusCode === 401) {
            const token = remove(session);
            if (token) revoke(token).catch(() => console.error('[Canopy GitHub] Revoked token cleanup failed; revoke the app in GitHub Settings.'));
            throw fail(401, 'GitHub authorization was revoked or expired. Sign in again.');
          }
          throw error;
        }
        const rows = await response.json();
        if (!Array.isArray(rows)) throw fail(502, 'GitHub returned invalid repository data.');
        const repositories = rows.filter(row => row.private === false && row.visibility === 'public').map(row => {
          const canonical = Records.repository(row.html_url);
          if (typeof row.full_name !== 'string' || canonical !== `https://github.com/${row.full_name.toLowerCase()}`) throw fail(502, 'GitHub returned inconsistent repository identity.');
          return { fullName: row.full_name, url: canonical, visibility: 'public', checkedAt: new Date(now()).toISOString() };
        });
        return send(200, { repositories, nextPage: /rel="next"/.test(response.headers.get('link') || '') ? Number(number) + 1 : null });
      }
      return send(404, { error: 'GitHub connector route not found.' });
    } catch (error) {
      console.error('[Canopy GitHub] Request failed.', error.statusCode || 502);
      return send(error.statusCode || 502, { error: error.statusCode ? error.message : 'GitHub connector unavailable. Please retry.' });
    }
  }
  return { handle };
}
module.exports = { createGitHubOAuth };
