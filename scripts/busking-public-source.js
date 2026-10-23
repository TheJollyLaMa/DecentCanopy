(function (root) {
  'use strict';
  const Model = typeof module !== 'undefined' && module.exports ? require('./public-source') : root.CanopyPublicSource;
  const BASE = 'https://decentbusking.onrender.com/api/';
  const CHAIN = 8453;
  const ROUTER = '0x8ecca903e2a6daa8ccbb933700e4f2c58c44a4b5';
  const ASSET = Object.freeze({ chainId: CHAIN, address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', symbol: 'USDC', decimals: 6 });
  const FUNDS = Object.freeze({
    'dbusk-playback': '0xf4bb87236dc130e0b6fe878dfc2feb2493e8cd12b946f6202d007cb4ff9ab088',
    'dbusk-top10': '0xce333a6f9183a29ebd46758d6a24cb64eec695b30f951d1d5397069f07ea74b6',
    'dbusk-repo-dev': '0xb838bd9003b34c10dce6bd1283209add90eab6dc180463eb64edc11e5132bc6d',
    'dbusk-pinners': '0x353f4eae2f35728a9677c9bc6fbbb39893ae3f8950d0ff97d1e76db48fbf40f8'
  });
  const descriptor = Object.freeze({
    id: 'provider:decentbusking', label: 'DecentBusking public funds',
    projectRefs: ['agency-project:decent-busking', 'artizen-project:1781373834890x379230429827301400',
      'decent-project:0x807061df657a7697c04045da7d16d941861caabc:cd695985-650e-472e-8f3b-64cbb9a7f682'],
    capabilities: ['funds', 'source-reported-router-payouts', 'source-status']
  });
  const BALANCE_BLOCKER = 'Balances, reservations and availability unavailable: the upstream balance reader substitutes zero on RPC failure; fund balances and deposits also omit explicit asset metadata.';
  const WEEKLY_BLOCKER = 'Weekly reconciliation unresolved: source-reported weeks and unmatched payouts are not independently reconciled by Canopy. Empty weeks never mean zero payouts.';
  const PROOF_LIMIT = 'Source-reported router event, not independently verified by Canopy. Explorer links are evidence pointers, not receipt verification. Coverage may be incomplete; unrelated to direct treasury-transfer association badges.';
  const lower = value => typeof value === 'string' ? value.toLowerCase() : '';
  const check = Model.requireValue;
  const block = value => Number.isSafeInteger(value) && value >= 0;
  const unknownCoverage = () => ({ state: 'partial', fromBlock: null, throughBlock: null });
  function observed(value, now) {
    Model.timestamp(value);
    check(Date.parse(value) <= now + 60000, 'Source timestamp is in the future');
    return now - Date.parse(value) > 15 * 60 * 1000 ? 'stale' : 'available';
  }
  function envelope(value, now) {
    check(value?.schemaVersion === 1, 'Unsupported upstream schema version');
    check(value.chainId === CHAIN && lower(value.routerAddress) === ROUTER, 'Unexpected source chain/router');
    check(typeof value.ready === 'boolean' && typeof value.lastError === 'string', 'Missing source readiness/error');
    const state = observed(value.lastCheckedAt, now);
    return !value.ready || value.lastError ? 'partial' : state;
  }
  function source(id, endpoint, value, now, weekly = false) {
    const state = weekly ? observed(new Date(value.now).toISOString(), now) : envelope(value, now);
    const coverage = unknownCoverage();
    if (!weekly && endpoint === 'payroll/ledger') {
      check((value.scannedFrom === null || block(value.scannedFrom)) && (value.scannedThrough === null || block(value.scannedThrough)), 'Invalid ledger scan coverage');
      Object.assign(coverage, { fromBlock: value.scannedFrom, throughBlock: value.scannedThrough });
      Model.coverage(coverage);
    }
    return { id, url: BASE + endpoint, state, observedAt: weekly ? new Date(value.now).toISOString() : value.lastCheckedAt,
      ready: weekly ? null : value.ready, lastError: value.lastError ? 'Source reports lastError; raw diagnostics withheld.' : '',
      coverage, attributes: weekly ? { version: 'Unversioned endpoint; status only, no weekly financial normalization' } : {} };
  }
  function record(kind, id, label, status, extra = {}) {
    return Model.validateRecord({
      schemaVersion: 1, id, kind, label,
      source: { id: status.id, url: status.url, observedAt: status.observedAt, verification: 'observed',
        limitations: [kind === 'interaction' ? PROOF_LIMIT : 'Public API observation; not independent contract, identity or ownership verification.'] },
      coverage: { ...status.coverage, state: status.state === 'stale' ? 'stale' : 'partial' },
      network: { chainId: CHAIN, address: ROUTER }, ...extra
    });
  }
  function event(entry, slug, status, payroll = false) {
    check(lower(entry.fundId) === FUNDS[slug] && (!entry.slug || entry.slug === slug), 'Unexpected event fund');
    check(lower(entry.asset) === ASSET.address && Model.ADDRESS.test(entry.recipient), 'Unexpected payout asset/recipient');
    check(Model.HASH.test(entry.txHash) && block(entry.blockNumber) && block(entry.logIndex), 'Invalid router event coordinates');
    Model.units(entry.amountUnits);
    if (payroll) {
      check(entry.chainId === CHAIN && lower(entry.routerAddress) === ROUTER && Model.HASH.test(entry.blockHash), 'Unexpected payroll deployment/block');
      check(['verified', 'unverified'].includes(entry.verification), 'Unknown source verification policy');
      observed(entry.paidAt, Date.parse(status.observedAt));
    } else {
      check(Number.isSafeInteger(entry.timestamp) && entry.timestamp >= 0, 'Missing event timestamp');
      check(entry.timestamp * 1000 <= Date.parse(status.observedAt) + 60000, 'Event timestamp after source observation');
    }
    return record('interaction', `busking:payout:${entry.txHash.toLowerCase()}:${entry.logIndex}`,
      'Router payroll payout · source-reported', status, {
        asset: ASSET, amounts: { paid: entry.amountUnits }, references: { fund: `busking:fund:${slug}`, contract: 'busking:contract:router' },
        attributes: { event: 'PayrollPaid', recipient: entry.recipient, fundSlug: slug,
          blockNumber: String(entry.blockNumber), logIndex: String(entry.logIndex),
          paidAt: payroll ? entry.paidAt : new Date(entry.timestamp * 1000).toISOString(),
          sourceVerification: payroll ? entry.verification : 'Source-indexed; independent verification unavailable' },
        evidence: [{ url: `https://basescan.org/tx/${entry.txHash}#eventlog`, label: 'BaseScan router payroll evidence (not independently checked)' }]
      });
  }
  function normalizeFunds(value, status) {
    check(value.funds && !Array.isArray(value.funds) && typeof value.funds === 'object', 'Missing funds collection');
    const records = [], issues = [];
    for (const slug of Object.keys(FUNDS)) {
      const fund = value.funds[slug];
      if (!fund) { issues.push(`${slug}: fund unavailable in source response`); continue; }
      check(fund.slug === slug && typeof fund.label === 'string' && fund.label.length > 0 && fund.label.length <= 200, 'Unexpected fund identity');
      for (const key of ['balanceUnits', 'reservedUnits', 'availableUnits', 'payoutUnits', 'advertUnits', 'sponsorUnits', 'djukeUnits']) {
        if (fund[key] !== undefined) Model.units(fund[key]);
      }
      check(Array.isArray(fund.sources) && fund.sources.length <= 5000, 'Invalid deposit sources');
      const counts = { advert: 0, sponsor: 0, djuke: 0 };
      const depositIds = new Set();
      for (const deposit of fund.sources) {
        check(deposit.slug === slug && lower(deposit.fundId) === FUNDS[slug]
          && Object.hasOwn(counts, deposit.kind) && Model.ADDRESS.test(deposit.funder)
          && Model.HASH.test(deposit.txHash) && block(deposit.blockNumber) && block(deposit.logIndex), 'Invalid deposit provenance');
        Model.units(deposit.amountUnits);
        check(Number.isSafeInteger(deposit.timestamp) && deposit.timestamp >= 0
          && deposit.timestamp * 1000 <= Date.parse(status.observedAt) + 60000, 'Invalid deposit timestamp');
        const depositId = `${deposit.txHash.toLowerCase()}:${deposit.logIndex}`;
        check(!depositIds.has(depositId), 'Duplicate deposit identity');
        depositIds.add(depositId);
        counts[deposit.kind]++;
      }
      records.push(record('fund', `busking:fund:${slug}`, fund.label, status, {
        amounts: { balance: null, reserved: null, available: null }, references: { project: 'busking:project:decentbusking', contract: 'busking:contract:router' },
        attributes: { slug, balanceStatus: BALANCE_BLOCKER, depositStatus: 'Source-reported deposit counts only; amounts unavailable because asset identity is absent.',
          advertDeposits: String(counts.advert), sponsorDeposits: String(counts.sponsor), djukeDeposits: String(counts.djuke) }
      }));
      if (fund.payouts === undefined) { issues.push(`${slug}: payout history unavailable`); continue; }
      check(Array.isArray(fund.payouts) && fund.payouts.length <= 5000, 'Invalid fund payout collection');
      for (const payout of fund.payouts) records.push(event(payout, slug, status));
    }
    return { records, issues };
  }
  function normalizeLedger(value, status) {
    check(Array.isArray(value.entries) && value.entries.length <= 5000, 'Invalid payroll entries');
    check(typeof value.repositorySync === 'string' && typeof value.backupPending === 'boolean', 'Missing repository/snapshot status');
    check(typeof value.snapshotUri === 'string' && (!value.snapshotUri || /^ipfs:\/\/[a-zA-Z0-9]{20,120}$/.test(value.snapshotUri)), 'Invalid snapshot reference');
    status.attributes = {
      repositorySync: /not configured/i.test(value.repositorySync) ? 'Manual repository sync; automatic sync not configured' : 'Source reports repository sync state; not independently checked',
      snapshot: value.snapshotUri || 'Unavailable', backupPending: String(value.backupPending)
    };
    const records = [];
    let outsideScan = 0;
    for (const entry of value.entries) {
      const slug = Object.keys(FUNDS).find(key => FUNDS[key] === lower(entry.fundId));
      check(Boolean(slug), 'Unknown payroll fund');
      const inScan = status.coverage.fromBlock !== null && status.coverage.throughBlock !== null
        && entry.blockNumber >= status.coverage.fromBlock && entry.blockNumber <= status.coverage.throughBlock;
      const item = event(entry, slug, inScan ? status : { ...status, coverage: unknownCoverage() }, true);
      if (!inScan) {
        outsideScan++;
        item.source.limitations.push('This source entry is outside its declared scan interval; restored/earlier-event coverage is unknown.');
      }
      records.push(item);
    }
    status.attributes.outsideScanEntries = String(outsideScan);
    return records;
  }
  function normalizeWeekly(value, slug, now) {
    check(value?.schemaVersion === undefined, 'Weekly endpoint version changed; status adapter review required');
    check(value?.fundSlug === slug && Array.isArray(value.weeks) && Array.isArray(value.unmatchedPayouts)
      && value.weeks.length <= 1000 && value.unmatchedPayouts.length <= 5000
      && Number.isSafeInteger(value.now) && value.now >= 0, 'Invalid weekly source status');
    Model.units(value.unmatchedPaidUnits);
    const status = source(`busking:source:weeks:${slug}`, `funds/${slug}/weeks`, value, now, true);
    status.state = status.state === 'stale' ? 'stale' : 'partial';
    status.attributes = { ...status.attributes, fundSlug: slug, weeks: String(value.weeks.length),
      unmatchedPayouts: String(value.unmatchedPayouts.length), reconciliation: WEEKLY_BLOCKER };
    return status;
  }
  function createAdapter({ fetch: fetcher = root.fetch, now = () => Date.now(), timeoutMs = 12000 } = {}) {
    return Model.assertAdapter({ descriptor, async getSnapshot() {
      const endpoints = ['funds', 'payroll/ledger', ...Object.keys(FUNDS).map(slug => `funds/${slug}/weeks`)];
      const responses = await Promise.allSettled(endpoints.map(endpoint => Model.fetchJSON(BASE + endpoint, { fetch: fetcher, timeoutMs })));
      const at = now(), sources = [], records = new Map(), suppressed = new Set(), issues = [BALANCE_BLOCKER, WEEKLY_BLOCKER];
      for (let index = 0; index < endpoints.length; index++) {
        const endpoint = endpoints[index], response = responses[index];
        const id = index === 0 ? 'busking:source:funds' : index === 1 ? 'busking:source:payroll' : `busking:source:weeks:${endpoint.split('/')[1]}`;
        try {
          if (response.status !== 'fulfilled') throw response.reason;
          const value = response.value;
          if (index > 1) { sources.push(normalizeWeekly(value, endpoint.split('/')[1], at)); continue; }
          const status = source(id, endpoint, value, at);
          const normalized = index === 0 ? normalizeFunds(value, status) : { records: normalizeLedger(value, status), issues: [] };
          const endpointIds = new Set();
          for (const item of normalized.records) {
            check(!endpointIds.has(item.id), 'Duplicate event identity in source response');
            endpointIds.add(item.id);
          }
          sources.push(status);
          issues.push(...normalized.issues);
          for (const item of normalized.records) {
            if (suppressed.has(item.id)) continue;
            const previous = records.get(item.id);
            if (previous && (previous.amounts.paid !== item.amounts.paid || previous.attributes.fundSlug !== item.attributes.fundSlug
              || previous.attributes.blockNumber !== item.attributes.blockNumber
              || Date.parse(previous.attributes.paidAt) !== Date.parse(item.attributes.paidAt)
              || lower(previous.attributes.recipient) !== lower(item.attributes.recipient))) {
              records.delete(item.id);
              suppressed.add(item.id);
              issues.push('Conflicting payout claims across sources; payout suppressed');
              continue;
            }
            records.set(item.id, item);
          }
          if (index === 0) {
            for (const [kind, recordId, label] of [['project', 'busking:project:decentbusking', 'DecentBusking'], ['contract', 'busking:contract:router', 'Base settlement router']]) {
              records.set(recordId, record(kind, recordId, label, status));
            }
          }
        } catch (error) {
          const message = error?.publicSourceValidation ? error.message
            : /^(Public source (HTTP \d{3}|timeout|response too large))$/.test(error?.message) ? error.message : 'Source schema/provenance unavailable or invalid';
          sources.push({ id, url: BASE + endpoint, state: 'unavailable', observedAt: null, ready: null,
            lastError: message, coverage: unknownCoverage(), attributes: {} });
          issues.push(`${endpoint}: ${message}`);
        }
      }
      return Model.validateSnapshot({ schemaVersion: 1, providerId: descriptor.id,
        state: records.size ? 'partial' : 'unavailable', observedAt: new Date(at).toISOString(), issues,
        sources, records: [...records.values()] });
    } });
  }
  const api = { descriptor, createAdapter, BASE, CHAIN, ROUTER, ASSET, FUNDS, BALANCE_BLOCKER, WEEKLY_BLOCKER, PROOF_LIMIT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CanopyBuskingPublicSource = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
