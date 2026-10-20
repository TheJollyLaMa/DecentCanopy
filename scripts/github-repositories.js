(function (root) {
  'use strict';
  const Records = typeof module !== 'undefined' && module.exports
    ? require('./creator-records') : root.DecentCreatorRecords;

  function parseInput(value) {
    return Records.repositories(value.split(/\r?\n/).map(line => line.trim()).filter(Boolean));
  }

  async function preview(value, { fetchImpl = fetch, now = () => new Date(), signal } = {}) {
    const url = Records.repository(value);
    const fullName = url.slice('https://github.com/'.length);
    const response = await fetchImpl(`https://api.github.com/repos/${fullName}`, {
      headers: { Accept: 'application/vnd.github+json' },
      credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store',
      signal: signal || AbortSignal.timeout(10000)
    });
    if (!response.ok) {
      const detail = response.status === 404 ? 'not found or not publicly accessible'
        : response.status === 403 || response.status === 429 ? 'access restricted or rate limited'
        : 'request failed';
      throw new Error(`GitHub repository ${detail} (HTTP ${response.status}). Check the public URL; no metadata was confirmed.`);
    }
    const data = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('GitHub returned malformed repository metadata. No metadata was confirmed.');
    }
    if (data.private !== false || data.visibility !== 'public') {
      throw new Error('Only public repositories can be previewed. Private metadata will not be shown or saved.');
    }
    if (typeof data.full_name !== 'string' || data.full_name.toLowerCase() !== fullName ||
        typeof data.html_url !== 'string' || Records.repository(data.html_url) !== url ||
        typeof data.owner?.login !== 'string' || data.owner.login.toLowerCase() !== fullName.split('/')[0] ||
        typeof data.name !== 'string' || data.name.toLowerCase() !== fullName.split('/')[1]) {
      throw new Error('GitHub returned a changed or inconsistent repository identity. Review the canonical public URL and preview it again.');
    }
    return { owner: data.owner.login, name: data.name, url, visibility: 'public', checkedAt: now().toISOString() };
  }

  const api = { parseInput, preview };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CanopyGitHubRepositories = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
