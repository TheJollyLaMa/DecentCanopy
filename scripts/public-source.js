(function (root) {
  'use strict';
  const VERSION = 1;
  const KINDS = ['creator', 'project', 'fund', 'contract', 'interaction', 'relationship'];
  const VERIFICATION = ['asserted', 'signed', 'self-published', 'mutually-acknowledged', 'observed', 'independently-verified'];
  const STATES = ['available', 'stale', 'partial', 'unavailable'];
  const ID = /^[a-z][a-z0-9-]*:[a-z0-9][a-z0-9:._/-]{0,239}$/;
  const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
  const HASH = /^0x[0-9a-fA-F]{64}$/;
  function requireValue(condition, message) {
    if (!condition) {
      const error = new Error(message);
      error.publicSourceValidation = true;
      throw error;
    }
  }
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const text = value => typeof value === 'string' && value.length > 0 && value.length <= 2000;
  function keys(value, allowed) {
    requireValue(object(value) && Object.keys(value).every(key => allowed.includes(key)), 'Unsupported record fields');
  }
  function units(value) {
    requireValue(typeof value === 'string' && /^(0|[1-9][0-9]{0,77})$/.test(value)
      && BigInt(value) < (1n << 256n), 'Expected exact unsigned uint256 units');
    return value;
  }
  function timestamp(value) {
    requireValue(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)
      && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z'), 'Invalid source timestamp');
    return value;
  }
  function publicURL(value) {
    requireValue(text(value), 'Missing public source URL');
    const url = new URL(value);
    requireValue(url.protocol === 'https:' && !url.username && !url.password, 'Expected public HTTPS URL');
    return value;
  }
  function coverage(value) {
    keys(value, ['state', 'fromBlock', 'throughBlock']);
    requireValue(STATES.includes(value.state), 'Invalid coverage state');
    for (const key of ['fromBlock', 'throughBlock']) {
      requireValue(value[key] === null || (Number.isSafeInteger(value[key]) && value[key] >= 0), 'Invalid coverage block');
    }
    requireValue(value.fromBlock === null || value.throughBlock === null || value.fromBlock <= value.throughBlock, 'Reversed coverage');
    return value;
  }
  function validateRecord(record) {
    keys(record, ['schemaVersion', 'id', 'kind', 'label', 'source', 'coverage', 'network', 'asset', 'amounts', 'references', 'evidence', 'attributes']);
    requireValue(record.schemaVersion === VERSION, 'Unsupported public record version');
    requireValue(ID.test(record.id) && KINDS.includes(record.kind) && text(record.label), 'Invalid record identity');
    keys(record.source, ['id', 'url', 'observedAt', 'verification', 'limitations']);
    requireValue(ID.test(record.source.id) && VERIFICATION.includes(record.source.verification), 'Invalid provenance');
    publicURL(record.source.url);
    timestamp(record.source.observedAt);
    requireValue(Array.isArray(record.source.limitations) && record.source.limitations.every(text), 'Missing provenance limitations');
    coverage(record.coverage);
    if (record.network) {
      keys(record.network, ['chainId', 'address']);
      requireValue(Number.isSafeInteger(record.network.chainId) && record.network.chainId > 0
        && ADDRESS.test(record.network.address), 'Invalid contract deployment');
    }
    if (record.asset) {
      keys(record.asset, ['chainId', 'address', 'symbol', 'decimals']);
      requireValue(Number.isSafeInteger(record.asset.chainId) && record.asset.chainId > 0
        && ADDRESS.test(record.asset.address) && text(record.asset.symbol)
        && Number.isInteger(record.asset.decimals) && record.asset.decimals >= 0 && record.asset.decimals <= 36, 'Invalid asset');
      requireValue(!record.network || record.network.chainId === record.asset.chainId, 'Asset network mismatch');
    }
    if (record.amounts) {
      requireValue(object(record.amounts), 'Invalid monetary values');
      for (const [key, value] of Object.entries(record.amounts)) {
        requireValue(/^[a-z][a-zA-Z0-9]{0,39}$/.test(key), 'Invalid amount name');
        if (value !== null) { requireValue(Boolean(record.asset), 'Monetary units require an explicit asset'); units(value); }
      }
    }
    if (record.references) requireValue(object(record.references) && Object.values(record.references).every(id => ID.test(id)), 'Invalid record reference');
    if (record.attributes) requireValue(object(record.attributes)
      && Object.keys(record.attributes).every(key => /^[a-z][a-zA-Z0-9]{0,39}$/.test(key))
      && Object.values(record.attributes).every(text), 'Invalid public attributes');
    if (record.evidence) {
      requireValue(Array.isArray(record.evidence), 'Invalid evidence');
      record.evidence.forEach(item => { keys(item, ['url', 'label']); publicURL(item.url); requireValue(text(item.label), 'Invalid evidence label'); });
    }
    if (record.kind === 'contract') requireValue(Boolean(record.network), 'Contract record requires deployment');
    if (record.kind === 'fund') requireValue(Boolean(record.references?.project), 'Fund record requires project reference');
    if (record.kind === 'interaction') requireValue(Boolean(record.attributes?.event) && Object.keys(record.references || {}).length > 0, 'Interaction record requires event and subject reference');
    if (record.kind === 'relationship') requireValue(Boolean(record.references?.from && record.references?.to && record.attributes?.relation), 'Relationship requires endpoints and relation');
    return record;
  }
  function assertAdapter(adapter) {
    requireValue(object(adapter) && object(adapter.descriptor) && ID.test(adapter.descriptor.id)
      && text(adapter.descriptor.label) && Array.isArray(adapter.descriptor.projectRefs)
      && adapter.descriptor.projectRefs.every(id => ID.test(id))
      && Array.isArray(adapter.descriptor.capabilities) && adapter.descriptor.capabilities.every(text)
      && typeof adapter.getSnapshot === 'function', 'Invalid public-source adapter');
    return adapter;
  }
  function validateSnapshot(snapshot) {
    keys(snapshot, ['schemaVersion', 'providerId', 'state', 'observedAt', 'issues', 'sources', 'records']);
    requireValue(snapshot.schemaVersion === VERSION && ID.test(snapshot.providerId) && STATES.includes(snapshot.state), 'Invalid snapshot');
    timestamp(snapshot.observedAt);
    requireValue(Array.isArray(snapshot.issues) && snapshot.issues.every(text) && Array.isArray(snapshot.sources)
      && Array.isArray(snapshot.records), 'Invalid snapshot collections');
    const sourceIds = new Set();
    snapshot.sources.forEach(source => {
      keys(source, ['id', 'url', 'state', 'observedAt', 'ready', 'lastError', 'coverage', 'attributes']);
      requireValue(ID.test(source.id) && STATES.includes(source.state) && (source.ready === null || typeof source.ready === 'boolean')
        && typeof source.lastError === 'string' && source.lastError.length <= 2000, 'Invalid source status');
      publicURL(source.url);
      if (source.observedAt !== null) timestamp(source.observedAt);
      coverage(source.coverage);
      requireValue(object(source.attributes) && Object.values(source.attributes).every(text), 'Invalid source attributes');
      requireValue(!sourceIds.has(source.id), 'Duplicate source identity');
      sourceIds.add(source.id);
    });
    const ids = new Set();
    snapshot.records.forEach(record => {
      validateRecord(record);
      requireValue(!ids.has(record.id), 'Duplicate record ID');
      requireValue(snapshot.sources.some(source => source.id === record.source.id), 'Unknown record source');
      ids.add(record.id);
    });
    requireValue(snapshot.state !== 'unavailable' || !snapshot.records.length, 'Unavailable snapshot cannot imply known records');
    return snapshot;
  }
  function formatUnits(value, decimals) {
    units(value);
    requireValue(Number.isInteger(decimals) && decimals >= 0 && decimals <= 36, 'Invalid decimals');
    if (!decimals) return value;
    const digits = value.padStart(decimals + 1, '0');
    return `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`;
  }
  async function fetchJSON(url, { fetch: fetcher = root.fetch, timeoutMs = 12000, maxBytes = 1024 * 1024 } = {}) {
    publicURL(url);
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        (async () => {
          const response = await fetcher(url, { method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal });
          requireValue(response.ok, `Public source HTTP ${response.status}`);
          requireValue(!response.headers?.get('content-length') || Number(response.headers.get('content-length')) <= maxBytes, 'Public source response too large');
          const reader = response.body?.getReader();
          let body = '';
          if (reader) {
            const decoder = new TextDecoder();
            let length = 0;
            try {
              while (true) {
                const chunk = await reader.read();
                if (chunk.done) break;
                length += chunk.value.byteLength;
                requireValue(length <= maxBytes, 'Public source response too large');
                body += decoder.decode(chunk.value, { stream: true });
              }
              body += decoder.decode();
            } finally { await reader.cancel(); }
          } else {
            body = await response.text();
            requireValue(new TextEncoder().encode(body).length <= maxBytes, 'Public source response too large');
          }
          return JSON.parse(body);
        })(),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Public source timeout')); }, timeoutMs); })
      ]);
    } finally { clearTimeout(timer); controller.abort(); }
  }
  const api = { VERSION, KINDS, VERIFICATION, STATES, ID, ADDRESS, HASH, requireValue, units, timestamp, publicURL, coverage, validateRecord, validateSnapshot, assertAdapter, formatUnits, fetchJSON };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CanopyPublicSource = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
