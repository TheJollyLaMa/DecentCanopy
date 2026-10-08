'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const {
  isoWeek,
  parseAirdropClaim,
  parseIssueForm,
  parsePinnerRequest,
  registeredRecipient,
} = require('../scripts/communityRewards');
const { formatUnits, parseUnits, verifyArtizenWallet } = require('../scripts/artizenOnchain');
const { evaluateAirdropClaim } = require('../scripts/processAirdropClaim');
const { acceptedCids, activeCommunityPinners, checkGateway, rewardablePinners } = require('../scripts/communityPinning');
const { evaluatePinnerApproval } = require('../scripts/processPinnerRequest');
const { airdropClaimUrl } = require('../scripts/artizen-account');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'community-rewards.json'), 'utf8'));
const ARTIZEN_WALLET = '0x5D9A2DAeEaAB5A87DF60ef3455FaeEA335bA916B';
const OTHER_WALLET = '0x1111111111111111111111111111111111111111';
const NOW = new Date('2026-09-14T12:00:00Z');

function airdropBody(overrides = {}) {
  const fields = {
    'Artizen wallet address': ARTIZEN_WALLET,
    'Creator name': 'Moss Maker',
    'Your Artizen projects': 'https://artizen.fund/index/p/decent-canopy?season=7\nhttps://artizen.fund/index/p/big-nuten',
    'Website (optional)': 'https://moss.example',
    'Connected wallet (optional)': '_No response_',
    'Show me on the globe': 'City (rounded to ~10 km)',
    'Location label': 'Portland, Oregon',
    'Approximate coordinates': '45.5231, -122.6765',
    'Publishing consent': '- [X] I agree that the details above are published',
    ...overrides,
  };
  return Object.entries(fields).map(([label, value]) => `### ${label}\n\n${value}`).join('\n\n');
}

test('parseIssueForm splits headings and blanks GitHub placeholders', () => {
  const fields = parseIssueForm('### One\n\nfirst\n\n### Two\n\n_No response_');
  assert.equal(fields.One, 'first');
  assert.equal(fields.Two, '');
});

test('parseAirdropClaim normalizes the claim and rounds location', () => {
  const claim = parseAirdropClaim(airdropBody());
  assert.equal(claim.artizenWallet, ARTIZEN_WALLET);
  assert.equal(claim.displayName, 'Moss Maker');
  assert.equal(claim.projectLinks.length, 2);
  assert.equal(claim.connectedWallet, null);
  assert.deepEqual(claim.sharedLocation, { consent: true, precision: 'city', label: 'Portland, Oregon', latitude: 45.5, longitude: -122.7 });
});

test('parseAirdropClaim requires consent, valid wallets, and Artizen project links', () => {
  assert.throws(() => parseAirdropClaim(airdropBody({ 'Publishing consent': '- [ ] I agree' })), /consent/);
  assert.throws(() => parseAirdropClaim(airdropBody({ 'Artizen wallet address': '0x123' })), /Artizen wallet/);
  assert.throws(() => parseAirdropClaim(airdropBody({ 'Your Artizen projects': 'https://evil.example/p/x' })));
  const hidden = parseAirdropClaim(airdropBody({ 'Show me on the globe': "Don't show my location" }));
  assert.equal(hidden.sharedLocation, null);
});

test('parsePinnerRequest trims gateway paths and requires commitment', () => {
  const body = [
    '### Base wallet for ART rewards', '', OTHER_WALLET, '',
    '### Gateway URL', '', 'https://moss.mypinata.cloud/ipfs/', '',
    '### Pinning setup', '', 'Pinata', '',
    '### Pinning commitment', '', '- [X] I will keep it pinned',
  ].join('\n');
  const request = parsePinnerRequest(body);
  assert.equal(request.gateway, 'https://moss.mypinata.cloud');
  assert.equal(request.provider, 'Pinata');
  assert.throws(() => parsePinnerRequest(body.replace('[X]', '[ ]')), /commitment/);
});

test('isoWeek follows ISO-8601 week numbering', () => {
  assert.equal(isoWeek(new Date('2026-01-01T00:00:00Z')), '2026-W01');
  assert.equal(isoWeek(new Date('2027-01-01T00:00:00Z')), '2026-W53');
  assert.equal(isoWeek(NOW), '2026-W38');
});

function mockChain({ mints = [], code = '0x', balance = '0x0' } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push(String(url));
    if (String(url).startsWith(config.airdrop.artizen.blockscoutApi)) {
      const body = mints.length
        ? { status: '1', message: 'OK', result: mints.map(([amount, tx]) => ({ data: `0x${parseUnits(amount).toString(16)}`, transactionHash: tx, timeStamp: '0x68b5c000' })) }
        : { status: '0', message: 'No logs found', result: [] };
      return { ok: true, json: async () => body };
    }
    const request = JSON.parse(options.body);
    const result = request.method === 'eth_getCode' ? code : balance;
    return { ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result }) };
  };
  return { fetchImpl, calls };
}

test('verifyArtizenWallet passes when Artizen minted enough ART to the wallet', async () => {
  const { fetchImpl, calls } = mockChain({ mints: [['6447.2', '0xabc']], code: '0x6001', balance: `0x${parseUnits('6447.2').toString(16)}` });
  const evidence = await verifyArtizenWallet(ARTIZEN_WALLET, config.airdrop.artizen, { fetchImpl, now: NOW });
  assert.equal(evidence.verified, true);
  assert.equal(evidence.artMinted, '6447.2');
  assert.equal(evidence.firstMintTx, '0xabc');
  assert.equal(evidence.smartAccount, true);
  assert.match(calls[0], /topic1=0x0{64}/);
  assert.match(calls[0], new RegExp(`topic2=0x0{24}${ARTIZEN_WALLET.slice(2).toLowerCase()}`));
});

test('verifyArtizenWallet fails below the threshold or with no mints', async () => {
  const small = await verifyArtizenWallet(ARTIZEN_WALLET, config.airdrop.artizen, { fetchImpl: mockChain({ mints: [['12', '0x1']] }).fetchImpl, now: NOW });
  assert.equal(small.verified, false);
  assert.match(small.reason, /threshold/);
  const none = await verifyArtizenWallet(ARTIZEN_WALLET, config.airdrop.artizen, { fetchImpl: mockChain().fetchImpl, now: NOW });
  assert.equal(none.verified, false);
  assert.equal(none.artMinted, '0');
});

test('formatUnits and parseUnits round-trip', () => {
  assert.equal(formatUnits(parseUnits('100')), '100');
  assert.equal(formatUnits(parseUnits('0.5')), '0.5');
});

function claimInput(overrides = {}) {
  return {
    claim: parseAirdropClaim(airdropBody()),
    claimant: 'MossMaker',
    issueRef: 'TheJollyLaMa/DecentCanopy#77',
    evidence: { verified: true, method: 'base-art-mint', artMinted: '6447.2', reason: 'ok' },
    creators: { creators: [] },
    queue: { pending: [], settled: [] },
    config: config.airdrop,
    now: NOW,
    queuedBy: 'github-actions[bot]',
    ...overrides,
  };
}

test('evaluateAirdropClaim queues 100 ART to the verified Artizen wallet', () => {
  const result = evaluateAirdropClaim(claimInput());
  assert.equal(result.status, 'approved');
  assert.equal(result.entry.role, 'airdrop');
  assert.equal(result.entry.contributor, ARTIZEN_WALLET);
  assert.equal(result.entry.contributorGithub, 'MossMaker');
  assert.equal(Number(result.entry.amount), 100);
  assert.deepEqual(result.creator.artizenProjects, ['decent-canopy', 'big-nuten']);
  assert.equal(result.creator.claimIssue, 'TheJollyLaMa/DecentCanopy#77');
});

test('evaluateAirdropClaim holds unverified wallets for review unless the owner approves', () => {
  const evidence = { verified: false, method: 'base-art-mint', reason: 'No ART has been minted' };
  assert.equal(evaluateAirdropClaim(claimInput({ evidence })).status, 'needs-review');
  const approved = evaluateAirdropClaim(claimInput({ evidence, ownerOverride: true }));
  assert.equal(approved.status, 'approved');
  assert.equal(approved.creator.verification.method, 'owner-approved');
});

test('evaluateAirdropClaim allows one claim per GitHub account and per wallet', () => {
  const first = evaluateAirdropClaim(claimInput());
  const creators = { creators: [first.creator] };
  assert.equal(evaluateAirdropClaim(claimInput({ creators })).status, 'already-claimed');
  assert.equal(evaluateAirdropClaim(claimInput({ creators, issueRef: 'TheJollyLaMa/DecentCanopy#78' })).status, 'rejected');
  const sameWallet = evaluateAirdropClaim(claimInput({ creators, claimant: 'SomeoneElse', issueRef: 'TheJollyLaMa/DecentCanopy#79' }));
  assert.equal(sameWallet.status, 'rejected');
  assert.match(sameWallet.reason, /One claim per wallet/);
});

test('registeredRecipient resolves each payout role from its own registry', () => {
  const creators = { creators: [{ github: 'MossMaker', artizenWallet: ARTIZEN_WALLET, claimIssue: 'o/r#1' }] };
  const pinners = { pinners: [{ github: 'PinPal', wallet: OTHER_WALLET, status: 'approved' }] };
  const accounts = { contributors: [{ github: 'Dev', walletAddress: OTHER_WALLET }] };
  const registries = { accounts, creators, pinners };
  assert.equal(registeredRecipient({ role: 'airdrop', contributorGithub: 'mossmaker', issueRef: 'o/r#1' }, registries), ARTIZEN_WALLET);
  assert.equal(registeredRecipient({ role: 'airdrop', contributorGithub: 'mossmaker', issueRef: 'o/r#2' }, registries), null);
  assert.equal(registeredRecipient({ role: 'pinner', contributorGithub: 'PinPal' }, registries), OTHER_WALLET);
  assert.equal(registeredRecipient({ role: 'contributor', contributorGithub: 'dev' }, registries), OTHER_WALLET);
});

test('acceptedCids keeps the current CID plus recent ones inside the grace window', () => {
  const manifest = {
    cid: 'bafycurrentcurrentcurrent',
    pinnedAt: '2026-09-14T00:00:00Z',
    payloadSha256: 'aa',
    recentCids: [
      { cid: 'bafycurrentcurrentcurrent', pinnedAt: '2026-09-14T00:00:00Z' },
      { cid: 'bafyrecentrecentrecent', pinnedAt: '2026-09-10T00:00:00Z' },
      { cid: 'bafystalestalestale', pinnedAt: '2026-08-01T00:00:00Z' },
    ],
  };
  assert.deepEqual(acceptedCids(manifest, { now: NOW, maxAgeDays: 8 }).map(row => row.cid), ['bafycurrentcurrentcurrent', 'bafyrecentrecentrecent']);
  assert.deepEqual(acceptedCids({ status: 'not-yet-pinned' }), []);
});

test('checkGateway passes only for byte-identical canopy payloads', async () => {
  const payload = Buffer.from(JSON.stringify({ format: 'decentcanopy-data-backup', files: {} }));
  const sha = crypto.createHash('sha256').update(payload).digest('hex');
  const serve = bytes => async url => {
    assert.equal(url, 'https://moss.example/ipfs/bafyx');
    return { ok: true, headers: new Map(), arrayBuffer: async () => bytes };
  };
  const pass = await checkGateway('https://moss.example/', { cid: 'bafyx', payloadSha256: sha }, { fetchImpl: serve(payload) });
  assert.equal(pass.ok, true);
  const tampered = await checkGateway('https://moss.example', { cid: 'bafyx', payloadSha256: sha }, { fetchImpl: serve(Buffer.from('{}')) });
  assert.equal(tampered.ok, false);
  assert.match(tampered.reason, /mismatch/);
  const missing = await checkGateway('https://moss.example', { cid: 'bafyx' }, { fetchImpl: async () => ({ ok: false, status: 504 }) });
  assert.equal(missing.reason, 'HTTP 504');
  const legacy = await checkGateway('https://moss.example', { cid: 'bafyx' }, { fetchImpl: serve(payload) });
  assert.equal(legacy.ok, true);
});

test('rewardablePinners caps rewards and favours the earliest approvals', () => {
  const pinners = [
    { github: 'b', status: 'approved', approvedAt: '2026-09-02' },
    { github: 'a', status: 'approved', approvedAt: '2026-09-01' },
    { github: 'c', status: 'approved', approvedAt: '2026-09-03' },
  ];
  const results = new Map([['a', { ok: true }], ['b', { ok: false }], ['c', { ok: true }]]);
  assert.deepEqual(rewardablePinners(pinners, results, 1).map(pinner => pinner.github), ['a']);
  assert.deepEqual(rewardablePinners(pinners, results, 5).map(pinner => pinner.github), ['a', 'c']);
  const registry = { pinners: [{ status: 'approved', lastCheck: { ok: true, checkedAt: '2026-09-13T00:00:00Z' } }, { status: 'approved', lastCheck: { ok: true, checkedAt: '2026-08-01T00:00:00Z' } }] };
  assert.equal(activeCommunityPinners(registry, { now: NOW }).length, 1);
});

test('evaluatePinnerApproval rejects duplicate pinners, gateways, and wallets', () => {
  const request = { wallet: OTHER_WALLET, gateway: 'https://moss.mypinata.cloud', provider: 'Pinata' };
  const first = evaluatePinnerApproval({ request, applicant: 'PinPal', issueRef: 'o/r#5', pinners: { pinners: [] }, now: NOW, approvedBy: 'TheJollyLaMa' });
  assert.equal(first.status, 'approved');
  const pinners = { pinners: [first.pinner] };
  assert.equal(evaluatePinnerApproval({ request, applicant: 'PinPal', issueRef: 'o/r#5', pinners, now: NOW }).status, 'already-approved');
  assert.match(evaluatePinnerApproval({ request, applicant: 'Other', issueRef: 'o/r#6', pinners, now: NOW }).reason, /gateway/);
  const sameWallet = { ...request, gateway: 'https://other.example' };
  assert.match(evaluatePinnerApproval({ request: sameWallet, applicant: 'Other', issueRef: 'o/r#6', pinners, now: NOW }).reason, /wallet/);
});

test('airdropClaimUrl prefills the issue form by field id', () => {
  const url = new URL(airdropClaimUrl({ connectedWallet: OTHER_WALLET, name: 'Moss' }));
  assert.equal(url.searchParams.get('template'), 'airdrop-claim.yml');
  assert.equal(url.searchParams.get('connected_wallet'), OTHER_WALLET);
  assert.equal(url.searchParams.get('display_name'), 'Moss');
  assert.equal(new URL(airdropClaimUrl({ connectedWallet: 'nope' })).searchParams.get('connected_wallet'), null);
});

test('issue form labels match what the parsers read', () => {
  const template = name => fs.readFileSync(path.join(__dirname, '..', '.github', 'ISSUE_TEMPLATE', name), 'utf8');
  const labels = text => [...text.matchAll(/^\s+label: (.+)$/gm)].map(match => match[1].trim());
  const airdrop = labels(fs.readFileSync(path.join(__dirname, '..', '.github', 'legacy-issue-templates', 'airdrop-claim.yml'), 'utf8'));
  ['Artizen wallet address', 'Creator name', 'Your Artizen projects', 'Website (optional)', 'Connected wallet (optional)',
    'Show me on the globe', 'Location label', 'Approximate coordinates', 'Publishing consent']
    .forEach(label => assert.ok(airdrop.includes(label), `airdrop template is missing "${label}"`));
  const pinner = labels(template('pinner-request.yml'));
  ['Base wallet for USDC rewards', 'Gateway URL', 'Pinning setup', 'Pinning commitment']
    .forEach(label => assert.ok(pinner.includes(label), `pinner template is missing "${label}"`));
});

test('the adapter adds community creators and merges the curated creator', () => {
  const adapterPath = path.join(__dirname, '..', 'scripts', 'data-adapter', 'artizen-adapter.js');
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(adapterPath, 'utf8'), sandbox, { filename: adapterPath });
  const snapshot = { generatedAt: '2026-09-07T00:00:00Z', projects: [{ id: 'p1', slug: 'decent-canopy', name: 'DecentCanopy' }], funds: [], relationships: [] };
  const curation = { creator: { id: 'curator:thejollylama', name: 'TheJollyLaMa' }, projects: [], associations: [] };
  const community = { creators: [
    { github: 'TheJollyLaMa', artizenWallet: ARTIZEN_WALLET, artizenProjects: [], claimIssue: 'o/r#1', verification: { method: 'base-art-mint', verified: true } },
    { id: 'community-creator:mossmaker', github: 'MossMaker', name: 'Moss Maker', artizenWallet: OTHER_WALLET, artizenProjects: ['decent-canopy', 'missing'], website: 'https://moss.example',
      sharedLocation: { consent: true, precision: 'country', label: 'Canada', latitude: 56, longitude: -106 }, claimIssue: 'o/r#2', verification: { method: 'base-art-mint', verified: true } },
  ] };
  const data = sandbox.window.GTPArtizenDataAdapter.transform(snapshot, curation, community);
  const curated = data.projects.find(entity => entity.id === 'curator:thejollylama');
  assert.equal(curated.communityVerification.method, 'base-art-mint');
  assert.equal(curated.publicWallet.address, ARTIZEN_WALLET.toLowerCase());
  const moss = data.projects.find(entity => entity.id === 'community-creator:mossmaker');
  assert.equal(moss.status, 'community-verified');
  assert.equal(moss.sharedLocation.label, 'Canada');
  assert.equal(data.projects.filter(entity => entity.kind === 'creator').length, 2);
  const edges = data.associations.filter(edge => edge.source === 'community-creator:mossmaker');
  assert.equal(edges.length, 1);
  assert.equal(edges[0].target, 'artizen-project:p1');
  assert.equal(edges[0].type, 'creator-associated');
});
