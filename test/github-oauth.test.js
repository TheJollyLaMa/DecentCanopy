'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGitHubOAuth } = require('../relay/github-oauth');
const { create } = require('../scripts/github-connection');
const { createRelay } = require('../relay/server');
const origin = 'https://thejollylama.github.io';
const callbackUrl = 'https://relay.test/github/callback';
const publicRepo = (name = 'One') => ({ private: false, visibility: 'public',
  full_name: `Owner/${name}`, html_url: `https://github.com/Owner/${name}`, token: 'must-not-leak' });

function harness({ scope = '', rows = [publicRepo()], apiStatus = 200, exchangeStatus = 200, ...options } = {}) {
  let clock = Date.now();
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (init.method === 'DELETE') return new Response(null, { status: 204 });
    if (url.includes('/login/oauth/access_token')) return Response.json({ access_token: 'github-secret-token', token_type: 'bearer', scope }, { status: exchangeStatus });
    if (url.endsWith('/user')) return Response.json({ id: 123, login: 'Owner', email: 'not-returned' });
    return Response.json(rows, { status: apiStatus, headers: { link: '<https://api.github.com/ignore>; rel="next"' } });
  };
  const oauth = createGitHubOAuth({
    clientId: 'client', clientSecret: 'app-secret', callbackUrl,
    allowed: value => value === origin, limited: () => false, now: () => clock, fetchImpl, ...options
  });
  async function request(path, { method = 'GET', headers = {} } = {}) {
    let status, responseHeaders, raw;
    const handled = await oauth.handle({ method, headers, socket: { remoteAddress: '127.0.0.1' } },
      { writeHead(code, h) { status = code; responseHeaders = h; }, end(body) { raw = body; } }, new URL(path, callbackUrl));
    let body;
    try { body = JSON.parse(raw); } catch { body = raw; }
    return { handled, status, headers: responseHeaders, body, raw };
  }
  async function pending() {
    const result = await request('/github/connect', { method: 'POST', headers: { origin } });
    assert.equal(result.status, 201);
    const start = await request(result.body.authorizeUrl);
    const state = new URL(start.headers.Location).searchParams.get('state');
    const cookie = start.headers['Set-Cookie'].split(';')[0];
    const headers = { origin, authorization: `Bearer ${result.body.session}` };
    return { result, state, cookie, headers, start };
  }
  async function ready() {
    const s = await pending();
    const response = await request(`/github/callback?state=${s.state}&code=one-use-code`, { headers: { cookie: s.cookie } });
    return { ...s, response };
  }
  return { request, pending, ready, calls, advance: ms => { clock += ms; } };
}

test('OAuth is disabled without credentials and validates its callback URL', async () => {
  const h = harness({ clientSecret: undefined });
  assert.deepEqual((await h.request('/github/status')).body, { configured: false });
  assert.equal((await h.request('/github/connect', { method: 'POST', headers: { origin } })).status, 503);
  for (const value of ['http://evil.test/github/callback', 'https://relay.test/elsewhere', 'https://u:p@relay.test/github/callback', `${callbackUrl}?x=1`]) {
    assert.throws(() => harness({ callbackUrl: value }), /CALLBACK_URL/);
  }
});

test('OAuth uses empty scopes, a one-use state and a secure HttpOnly browser binding', async () => {
  const h = harness(), s = await h.pending();
  assert.equal(new URL(s.start.headers.Location).searchParams.get('scope'), '');
  assert.match(s.start.headers['Set-Cookie'], /HttpOnly; SameSite=Lax; Max-Age=600; Secure/);
  assert.equal((await h.request(s.result.body.authorizeUrl)).status, 400);
  assert.equal((await h.request(`/github/callback?state=${s.state}&code=x`)).status, 400);
  assert.equal((await h.request('/github/callback?state=made-up&code=x')).status, 400);
  assert.equal(h.calls.length, 0);
  assert.equal((await h.request(`/github/callback?state=${s.state}&code=x`, { headers: { cookie: s.cookie } })).status, 200);
  assert.equal((await h.request(`/github/callback?state=${s.state}&code=x`, { headers: { cookie: s.cookie } })).status, 400);
  await h.request('/github/session', { method: 'DELETE', headers: s.headers });
});

test('successful OAuth returns only public allowlisted paginated repository metadata, never credentials', async () => {
  const h = harness({ rows: [publicRepo(), { ...publicRepo('Private'), private: true, visibility: 'private' }] });
  const s = await h.ready();
  assert.match(s.response.raw, /sign-in succeeded/);
  const status = await h.request('/github/session', { headers: s.headers });
  assert.equal(status.body.login, 'Owner');
  const result = await h.request('/github/repos?page=1', { headers: s.headers });
  assert.equal(result.status, 200);
  assert.equal(result.body.repositories.length, 1);
  assert.equal(result.body.nextPage, 2);
  assert.deepEqual(Object.keys(result.body.repositories[0]).sort(), ['checkedAt', 'fullName', 'url', 'visibility']);
  assert.equal(result.body.repositories[0].url, 'https://github.com/owner/one');
  assert.doesNotMatch(JSON.stringify([s.result, status, result, s.response]), /github-secret-token|app-secret|must-not-leak|Private|not-returned/);
  assert.match(h.calls.find(c => c.url.includes('/user/repos')).url, /visibility=public/);
  await h.request('/github/session', { method: 'DELETE', headers: s.headers });
});

test('origin binding, missing session, pagination input and rate limits are enforced', async () => {
  const h = harness(), s = await h.ready();
  assert.equal((await h.request('/github/connect', { method: 'POST' })).status, 403);
  assert.equal((await h.request('/github/repos', { headers: { ...s.headers, origin: 'https://evil.test' } })).status, 403);
  assert.equal((await h.request('/github/repos', { headers: { origin } })).status, 401);
  assert.equal((await h.request('/github/repos?page=0', { headers: s.headers })).status, 400);
  assert.equal((await h.request('/github/repos?page=https://evil.test', { headers: s.headers })).status, 400);
  assert.equal((await harness({ limited: () => true }).request('/github/connect', { method: 'POST', headers: { origin } })).status, 429);
  await h.request('/github/session', { method: 'DELETE', headers: s.headers });
});

test('expired and disconnected sessions lose access and revoke their GitHub token', async () => {
  const h = harness(), s = await h.ready();
  assert.equal((await h.request('/github/session', { method: 'DELETE', headers: s.headers })).status, 200);
  assert.equal((await h.request('/github/repos', { headers: s.headers })).status, 401);
  assert.equal(h.calls.filter(c => c.init.method === 'DELETE').length, 1);
  const next = await h.ready();
  h.advance(600001);
  assert.equal((await h.request('/github/session', { headers: next.headers })).status, 401);
  assert.equal(h.calls.filter(c => c.init.method === 'DELETE').length, 2);
});

test('GitHub-side revocation invalidates the relay capability and permits a fresh connection', async () => {
  const h = harness({ apiStatus: 401 }), revoked = await h.ready();
  const result = await h.request('/github/repos', { headers: revoked.headers });
  assert.equal(result.status, 401);
  assert.match(result.body.error, /revoked or expired/i);
  assert.equal((await h.request('/github/session', { headers: revoked.headers })).status, 401);
  assert.equal(h.calls.filter(c => c.init.method === 'DELETE').length, 1);

  const reconnected = await h.ready();
  assert.equal((await h.request('/github/session', { headers: reconnected.headers })).body.status, 'ready');
  assert.notEqual(reconnected.result.body.session, revoked.result.body.session);
  await h.request('/github/session', { method: 'DELETE', headers: reconnected.headers });
});

test('cancelled, failed and over-scoped authorizations never become connected', async () => {
  const denied = harness(), s = await denied.pending();
  await denied.request(`/github/callback?state=${s.state}&error=access_denied`, { headers: { cookie: s.cookie } });
  assert.match((await denied.request('/github/session', { headers: s.headers })).body.error, /cancelled/);
  for (const options of [{ scope: 'repo' }, { exchangeStatus: 500 }]) {
    const h = harness(options), ready = await h.ready();
    const state = await h.request('/github/session', { headers: ready.headers });
    assert.equal(state.body.status, 'error');
    assert.equal((await h.request('/github/repos', { headers: ready.headers })).status, 409);
    if (options.scope) assert.ok(h.calls.some(c => c.init.method === 'DELETE'));
    await h.request('/github/session', { method: 'DELETE', headers: ready.headers });
  }
  await denied.request('/github/session', { method: 'DELETE', headers: s.headers });
});

test('changed identities, malformed pages and revoked/rate-limited API access are explicit errors', async () => {
  for (const options of [{ rows: {} }, { rows: [{ ...publicRepo(), full_name: 'other/repo' }] }, { apiStatus: 401 }, { apiStatus: 429 }]) {
    const h = harness(options), s = await h.ready();
    assert.ok((await h.request('/github/repos', { headers: s.headers })).status >= 400);
    await h.request('/github/session', { method: 'DELETE', headers: s.headers });
  }
});

test('relay exposes OAuth status and permits the connector CORS methods without leaking its dispatch token', async () => {
  const relay = createRelay({ token: 'dispatch-secret', repository: 'owner/repo', allowedOrigins: [origin], verifyMessage() {} });
  let code, headers, body;
  const res = { writeHead(c, h) { code = c; headers = h; }, end(b) { body = b; } };
  await relay.handle({ method: 'OPTIONS', headers: { origin }, url: '/github/session' }, res);
  assert.equal(code, 204);
  assert.match(headers['Access-Control-Allow-Methods'], /DELETE/);
  assert.match(headers['Access-Control-Allow-Headers'], /Authorization/);
  await relay.handle({ method: 'GET', headers: { origin }, url: '/github/status' }, res);
  assert.equal(code, 200);
  assert.deepEqual(JSON.parse(body), { configured: false });
  assert.doesNotMatch(body, /dispatch-secret/);
});

function browserHarness({ sessionState = { status: 'ready', login: 'Owner' }, page = { repositories: [{ url: 'https://github.com/owner/one', fullName: 'Owner/One', visibility: 'public', checkedAt: new Date().toISOString() }], nextPage: 2 } } = {}) {
  const calls = [], popup = { location: '', closed: false, close() { this.closed = true; } };
  let revoked = false;
  const client = create({ relay: 'https://relay.test', sleep: async () => {},
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith('/github/connect')) return Response.json({ session: 'a'.repeat(64), authorizeUrl: 'https://relay.test/github/start?state=s' });
      if (init.method === 'DELETE') return Response.json({ disconnected: true });
      if (url.includes('/github/repos')) return Response.json(
        revoked ? { error: 'GitHub authorization was revoked or expired. Sign in again.' } : page,
        { status: revoked ? 401 : 200 }
      );
      return Response.json(sessionState);
    }
  });
  return { client, calls, popup, revoke: () => { revoked = true; }, restore: () => { revoked = false; } };
}

test('browser sign-in, paginated public choices and disconnect use in-memory relay capabilities only', async () => {
  const h = browserHarness();
  assert.equal(await h.client.connect(h.popup), 'Owner');
  assert.equal(h.popup.closed, true);
  assert.equal((await h.client.repositories()).repositories[0].fullName, 'Owner/One');
  const request = h.calls.find(c => c.url.includes('/github/repos'));
  assert.equal(request.init.credentials, 'omit');
  assert.equal(request.init.headers.Authorization, `Bearer ${'a'.repeat(64)}`);
  await h.client.disconnect();
  await assert.rejects(h.client.repositories(), /Sign in/);
  assert.equal(h.calls.at(-1).init.method, 'DELETE');
  assert.equal(await h.client.connect(h.popup), 'Owner');
  assert.equal((await h.client.repositories()).repositories[0].fullName, 'Owner/One');
  assert.equal(h.popup.closed, true);
});

test('browser clears a revoked capability so a subsequent sign-in can reconnect', async () => {
  const h = browserHarness();
  await h.client.connect(h.popup);
  h.revoke();
  await assert.rejects(h.client.repositories(), /revoked or expired/i);
  await assert.rejects(h.client.repositories(), /Sign in to GitHub first/);
  h.restore();
  assert.equal(await h.client.connect(h.popup), 'Owner');
  const result = await h.client.repositories();
  assert.equal(result.repositories[0].fullName, 'Owner/One');
});

test('browser popup denial, OAuth cancellation and invalid/private repository pages fail explicitly', async () => {
  await assert.rejects(browserHarness().client.connect(null), /popups/);
  const denied = browserHarness({ sessionState: { status: 'error', error: 'Permission denied' } });
  await assert.rejects(denied.client.connect(denied.popup), /Permission denied/);
  assert.ok(denied.calls.some(c => c.init.method === 'DELETE'));
  for (const page of [{ repositories: [], nextPage: 99 }, { repositories: [{ url: 'https://github.com/owner/one', fullName: 'Owner/One', visibility: 'private', checkedAt: new Date().toISOString() }], nextPage: null }]) {
    const h = browserHarness({ page });
    await h.client.connect(h.popup);
    await assert.rejects(h.client.repositories(), /invalid/);
    await h.client.disconnect();
  }
});
