(function (root) {
  'use strict';

  const TYPES = ['creator-associated', 'collaboration', 'fund-member', 'fund-steward'];
  const MAX_RECORDS = 1000;
  const NETWORKS = {
    1: { name: 'Ethereum', explorer: 'https://etherscan.io', symbol: 'ETH' },
    10: { name: 'Optimism', explorer: 'https://optimistic.etherscan.io', symbol: 'ETH' },
    8453: { name: 'Base', explorer: 'https://basescan.org', symbol: 'ETH' },
  };

  function text(value, label, max = 300) {
    if (typeof value !== 'string' || !value.trim() || value.length > max) {
      throw new Error(`${label} must be non-empty text of at most ${max} characters.`);
    }
    return value.trim();
  }

  function date(value, label) {
    const result = text(value, label);
    if (!/^\d{4}-\d{2}-\d{2}T/.test(result) || !Number.isFinite(Date.parse(result))) {
      throw new Error(`${label} must be an ISO timestamp.`);
    }
    return new Date(result).toISOString();
  }

  function number(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error(`${label} must be a finite non-negative number.`);
    }
    return value;
  }

  function website(value) {
    if (!value) return null;
    const url = new URL(text(value, 'Website URL', 2048));
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new Error('Website URLs must use HTTPS and must not contain credentials.');
    }
    return url.href;
  }

  function rows(value, label) {
    if (!Array.isArray(value) || value.length > MAX_RECORDS) {
      throw new Error(`${label} must be an array of at most ${MAX_RECORDS} records.`);
    }
    return value;
  }

  function wallet(value) {
    if (!value) return null;
    if (!NETWORKS[value.chainId] || !Number.isSafeInteger(value.chainId)
      || typeof value.address !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value.address)
      || /^0x0{40}$/i.test(value.address)) {
      throw new Error('Wallet must be a non-zero EVM address on Ethereum (1), Optimism (10), or Base (8453).');
    }
    return { address: value.address.toLowerCase(), chainId: value.chainId };
  }

  function location(value) {
    if (!value) return null;
    if (value.consent !== true) throw new Error('Each location requires explicit location consent.');
    if (!['country', 'city', 'precise', 'space'].includes(value.precision)) {
      throw new Error('Location precision must be country, city, precise, or space.');
    }
    const result = {
      consent: true, precision: value.precision, label: text(value.label, 'Location label', 120),
    };
    if (value.precision === 'space') return result;
    if (value.latitude != null || value.longitude != null || value.precision === 'precise') {
      if (!Number.isFinite(value.latitude) || !Number.isFinite(value.longitude)
        || Math.abs(value.latitude) > 90 || Math.abs(value.longitude) > 180) {
        throw new Error('Latitude must be -90 to 90 and longitude -180 to 180; supply both coordinates.');
      }
      const digits = value.precision === 'precise' ? 6 : value.precision === 'city' ? 1 : 0;
      result.latitude = Number(value.latitude.toFixed(digits));
      result.longitude = Number(value.longitude.toFixed(digits));
    }
    return result;
  }

  async function readLedgerBalance(provider, publicWallet) {
    const linked = wallet(publicWallet);
    if (!provider || !linked) throw new Error('Connect a wallet provider and link a public address first.');
    async function readChain() {
      const value = await provider.request({ method: 'eth_chainId' });
      if (typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value)) throw new Error('Provider returned a malformed chain id.');
      return Number.parseInt(value, 16);
    }
    const chain = await readChain();
    if (chain !== linked.chainId) throw new Error(`Select ${NETWORKS[linked.chainId].name} in your wallet first. We will not switch networks automatically.`);
    const block = await provider.request({ method: 'eth_blockNumber' });
    if (typeof block !== 'string' || !/^0x[0-9a-f]+$/i.test(block)) throw new Error('Provider returned a malformed block number.');
    const balance = await provider.request({ method: 'eth_getBalance', params: [linked.address, block] });
    const finalChain = await readChain();
    if (finalChain !== linked.chainId) throw new Error('Wallet network changed during the lookup. Please retry.');
    if (typeof balance !== 'string' || !/^0x[0-9a-f]+$/i.test(balance)) throw new Error('Provider returned a malformed balance.');
    const wei = BigInt(balance);
    return {
      eth: `${wei / 10n ** 18n}.${(wei % (10n ** 18n)).toString().padStart(18, '0')}`,
      block: BigInt(block).toString(), chainId: linked.chainId, readAt: new Date().toISOString(),
    };
  }

  function validate(input, baseEntities) {
    if (!input || input.format !== 'decentcanopy-participation' || input.version !== 1) {
      throw new Error('Expected a decentcanopy-participation version 1 JSON export.');
    }
    const known = new Map(baseEntities.map(entity => [entity.id, entity.kind]));
    const seen = new Set();
    const entities = rows(input.entities, 'entities').map(raw => {
      const id = text(raw.id, 'Entity id');
      if (seen.has(id)) throw new Error(`Duplicate entity: ${id}`);
      seen.add(id);
      const existing = known.get(id);
      if (!existing && (!/^local-creator:[a-zA-Z0-9_-]+$/.test(id) || raw.kind !== 'creator')) {
        throw new Error(`Unknown entity ${id}. Use an existing canopy id or a local-creator: id.`);
      }
      if (existing && raw.kind !== existing) throw new Error(`Entity kind does not match ${id}.`);
      known.set(id, raw.kind);
      const entity = { id, kind: raw.kind, name: text(raw.name, 'Entity name'), websiteUrl: website(raw.websiteUrl) };
      entity.publicWallet = wallet(raw.publicWallet);
      entity.sharedLocation = location(raw.sharedLocation);
      if (raw.funding) {
        if (!['project', 'fund'].includes(raw.kind) || raw.funding.currency !== 'USD') {
          throw new Error('Funding records require a project/fund and currency USD.');
        }
        if (!Number.isSafeInteger(raw.funding.season) || raw.funding.season < 1) {
          throw new Error('Funding season must be a positive integer.');
        }
        entity.funding = {
          raised: number(raw.funding.raised, 'Raised'),
          goal: number(raw.funding.goal, 'Goal'),
          currency: 'USD',
          season: raw.funding.season,
          asOf: date(raw.funding.asOf, 'Funding asOf'),
        };
      }
      return entity;
    });
    function reference(id, label) {
      if (!known.has(id)) throw new Error(`${label} references unknown entity ${id}.`);
      return id;
    }
    const connectionIds = new Set();
    const connections = rows(input.connections, 'connections').map(raw => {
      if (!TYPES.includes(raw.type)) throw new Error('Connection type must be creator-associated, collaboration, fund-member, or fund-steward.');
      const source = reference(raw.source, 'Connection');
      const target = reference(raw.target, 'Connection');
      if (source === target) throw new Error('A connection must join different entities.');
      if (raw.type === 'creator-associated' && (known.get(source) !== 'creator'
        || !['project', 'fund'].includes(known.get(target)))) {
        throw new Error('Creator associations must connect a creator to a project or fund.');
      }
      if (raw.type === 'fund-member' && (known.get(target) !== 'fund' || known.get(source) === 'fund')) {
        throw new Error('Fund membership must connect a project or creator to a fund.');
      }
      if (raw.type === 'fund-steward' && (known.get(source) !== 'creator' || known.get(target) !== 'fund')) {
        throw new Error('Fund stewardship must connect a creator to a fund.');
      }
      const key = JSON.stringify([raw.type, ...[source, target].sort()]);
      if (connectionIds.has(key)) throw new Error('Duplicate connection in import.');
      connectionIds.add(key);
      return { source, target, type: raw.type, sourceLabel: 'Participant-reported (unverified)' };
    });
    const eventIds = new Set();
    const events = rows(input.events, 'events').map(raw => {
      const id = text(raw.id, 'Event id');
      if (eventIds.has(id)) throw new Error(`Duplicate event id: ${id}`);
      eventIds.add(id);
      if (!['boost', 'purchase', 'counter-change'].includes(raw.type)) {
        throw new Error('Event type must be boost, purchase, or counter-change.');
      }
      const target = reference(raw.target, 'Event target');
      if (!['project', 'fund'].includes(known.get(target))) throw new Error('Events must target a project or fund.');
      const actor = raw.actor ? reference(raw.actor, 'Event actor') : null;
      if (actor && known.get(actor) !== 'creator') throw new Error('Event actors must be creator nodes.');
      if (raw.type === 'counter-change' && actor) throw new Error('Aggregate counter changes cannot be attributed to a creator.');
      const amount = number(raw.amount, 'Event amount');
      if (amount === 0) throw new Error('Event amount must be positive.');
      if (raw.type !== 'purchase' && !Number.isSafeInteger(amount)) throw new Error('Boost counts must be whole numbers.');
      if (raw.type === 'purchase' && raw.currency !== 'USD') throw new Error('Purchase currency must be USD.');
      return {
        id, target, actor, type: raw.type, amount,
        currency: raw.type === 'purchase' ? 'USD' : null,
        date: date(raw.date, 'Event date'), sourceLabel: 'Participant-reported (unverified)',
      };
    }).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    return {
      format: 'decentcanopy-participation', version: 1,
      coverage: text(input.coverage, 'Coverage description', 500),
      entities, connections, events,
    };
  }

  function apply(base, bundle, websites = {}, profiles = {}) {
    const overrides = new Map(bundle.entities.map(entity => [entity.id, entity]));
    const projects = base.projects.map(entity => ({ ...entity }));
    bundle.entities.filter(entity => entity.kind === 'creator' && !projects.some(p => p.id === entity.id))
      .forEach(entity => projects.push({
        id: entity.id, name: entity.name, kind: 'creator', track: 'Creators',
        status: 'participant-reported', raised: 0, goal: 0,
        description: 'Locally imported creator; identity and ownership are not verified.',
        sourceLabel: 'Participant-reported (unverified)',
      }));
    projects.forEach(entity => {
      const record = overrides.get(entity.id);
      if (record) {
        entity.websiteUrl = record.websiteUrl;
        entity.publicWallet = record.publicWallet || null;
        entity.sharedLocation = record.sharedLocation || null;
        entity.funding = record.funding || null;
        if (record.funding) {
          entity.raised = record.funding.raised;
          entity.goal = record.funding.goal;
        }
      }
      if (Object.hasOwn(websites, entity.id)) entity.websiteUrl = website(websites[entity.id]);
      if (Object.hasOwn(profiles, entity.id)) {
        entity.publicWallet = wallet(profiles[entity.id].publicWallet);
        entity.sharedLocation = location(profiles[entity.id].sharedLocation);
      }
      entity.participationEvents = bundle.events.filter(event => event.target === entity.id || event.actor === entity.id);
      entity.importCoverage = bundle.coverage;
    });
    const walletGroups = new Map();
    projects.forEach(entity => {
      if (!entity.publicWallet) return;
      const key = `${entity.publicWallet.chainId}:${entity.publicWallet.address}`;
      if (!walletGroups.has(key)) walletGroups.set(key, []);
      walletGroups.get(key).push(entity.id);
    });
    const walletLinks = [];
    walletGroups.forEach(ids => ids.slice(1).forEach(id => walletLinks.push({
      source: ids[0], target: id, type: 'shared-public-wallet',
      sourceLabel: 'Matching participant-declared wallet links (ownership unverified)',
      note: 'The same address on the same network; not proof of common ownership, a payment, or Artizen activity.',
    })));
    return { projects, associations: [...base.associations, ...bundle.connections, ...walletLinks], activity: base.activity };
  }

  const api = { validate, apply, website, wallet, location, readLedgerBalance, networks: NETWORKS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CanopyParticipationModel = api;
}(typeof window === 'undefined' ? globalThis : window));
