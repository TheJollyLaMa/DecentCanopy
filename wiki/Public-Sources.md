# Public project sources (schema v1)

Canopy's public-source layer is an optional, read-only overlay. It does not rewrite
signed creator records, the frozen Artizen archive, or existing direct
treasury-to-creator transfer/green association checks. ArtFi product integration
remains deferred; referencing the existing Busking settlement router is not an
ArtFi integration or permission to transact.

## Open the reference integration

In the [DecentAgency map](https://thejollylama.github.io/DecentCanopy/?canopy=agency),
select **DecentBusking** and expand **Public funds & router payroll · source
status**. The same overlay is available on the existing signed Busking project
and its historical project node. Requests start only when expanded, with an
explicit refresh button; there is no background financial polling or wallet
request. Provider/project references are declared in the adapter, not financial
conditions in graph rendering.

The four fund views are `dbusk-playback`, `dbusk-top10`, `dbusk-repo-dev`, and
`dbusk-pinners`. Missing source records are unavailable, not invented zero-value
funds. Each fund shows validated public identity, source-reported deposit counts
by category, and explicit unknown balances. The separate router evidence
disclosure shows at most 25 source records, exact integer units, source timestamps,
and BaseScan pointers. It does not assert a lifetime payout total.

### Evaluated public sources and blockers

Read-only checks on **2026-10-23**:

| Source | Observed behavior / interpretation |
| --- | --- |
| [Funds](https://decentbusking.onrender.com/api/funds) | Schema 1, Base 8453, configured router, four requested funds plus another fund outside this adapter's scope. Fund balances/deposit events omit explicit asset identity and decimals. Deposit amounts therefore are not normalized; only validated source-category counts are shown. |
| [Payroll ledger](https://decentbusking.onrender.com/api/payroll/ledger) | Schema 1, 21 source-reported `PayrollPaid` events with explicit USDC asset identity and `verification: verified`. This is the upstream worker's claim, **not independent Canopy verification**. Restored entries can fall outside the reported scan interval; their coverage is explicitly unknown. Scan progress can change between requests. |
| [Playback weeks](https://decentbusking.onrender.com/api/funds/dbusk-playback/weeks) / [Top 10 weeks](https://decentbusking.onrender.com/api/funds/dbusk-top10/weeks) | Each returned one week and no source-reported unmatched events during the check. That change from earlier evidence is not a Canopy reconciliation policy or independently verified weekly payout total. |
| [Repo-dev weeks](https://decentbusking.onrender.com/api/funds/dbusk-repo-dev/weeks) | Returned **no weeks and 11 unmatched payouts**. This remains unresolved, not zero payouts or reconciled history. |
| [Pinner weeks](https://decentbusking.onrender.com/api/funds/dbusk-pinners/weeks) | Returned no weeks and no source-reported unmatched events. Empty/partial coverage is not proof of no payments. |

The upstream [fund reader at inspected commit
7729bc8a](https://github.com/TheJollyLaMa/DecentBusking/blob/7729bc8a1e5d3958067fd97c5b92e154796eec81/discord-bot/fund-ledger.js#L313-L336)
uses `.catch(() => '0')` for a failed router balance read and falls back to a
balance for missing availability. A `ready: true` response cannot distinguish a
real zero from that failure. **All balances, reservations and availability are
therefore withheld**, including nonzero values. No such value is converted to
zero or replaced with a local estimate. Upstream readiness/error reporting and
explicit chain/asset/decimals on monetary collections are prerequisites for
enabling these fields.

Weekly responses currently lack schema version, deployment/asset identity and
reconciled coverage. They are used **only for source status/counts**, with readiness
unknown and reconciliation unresolved. No weekly payment amount is normalized.
Unmatched event contents and incidental profile/booking/Discord metadata are
discarded. Raw worker error messages are withheld to avoid exposing private
diagnostics; the UI explicitly says a source reported `lastError`.

The pinned configuration follows the [Busking contract
registry](https://github.com/TheJollyLaMa/DecentBusking/blob/7729bc8a1e5d3958067fd97c5b92e154796eec81/docs/CONTRACTS.md):
Base chain 8453, router `0x8ecca903e2a6Daa8CCbB933700e4F2C58C44A4B5`,
USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, six decimals.
Fund IDs are the allowlisted `keccak256(UTF8(slug))` values. The asset pin is used
only when a payout explicitly names that asset; it is not used to guess the
currency of asset-less balances or deposits.

A [sample source-reported router payroll
event](https://basescan.org/tx/0xc667b2e9b4fd6d466e4cbd86c5d828f384f3778994ea369e64a43fcf3101c656#eventlog)
is an evidence pointer, **not an independently verified payout in Canopy**.
Independent verification needs a separate trusted chain/receipt policy checking
canonical block hash, confirmations, router log address, event signature, fund,
asset, recipient and exact units. This bounded integration makes no direct RPC
calls, cannot award a verification badge, and does not satisfy that stronger
verification claim.

## Reusable adapter contract

`scripts/public-source.js` defines validation and bounded transport;
`scripts/busking-public-source.js` is the first provider;
`scripts/public-source-ui.js` renders normalized records without Busking-specific
conditions. A second provider can supply:

```js
{
  descriptor: {
    id: 'provider:garden', label: 'Community garden',
    projectRefs: ['garden:project:demo'],
    capabilities: ['funds', 'source-status']
  },
  async getSnapshot() { /* return a validated v1 snapshot, never a success fallback */ }
}
```

Register adapters with `CanopyPublicSourceUI.createUI([adapter, ...])`. The existing
graph adapter remains responsible for projects/associations; this additive,
lazy overlay deliberately does not change that older interface. No new
server/proxy secrets are needed. The existing site-file collector includes these
scripts for Pages/IPFS. The validation workflow explicitly runs
`test/public-source.test.js` and includes it in both push and pull-request path
filters; provider scripts are covered by the existing `scripts/**` filters.

### Envelope and record policies

- Snapshot: `schemaVersion: 1`, `providerId`, `state`, request `observedAt`,
  `issues`, `sources`, `records`.
- States: `available`, `stale`, `partial`, `unavailable`. An explicitly observed
  empty collection is different from an unavailable source. Unavailable snapshots
  cannot contain records; partial snapshots can preserve other working sources.
- Each source declares `id`, public HTTPS `url`, `state`, source `observedAt`
  (nullable), `ready` (boolean or unknown/null), sanitized `lastError`, `coverage`,
  and public string `attributes`. Scan start/through are nullable, validated safe
  integers. Unknown scan coverage stays `partial`.
- Every record has `schemaVersion`, stable namespace `id`, `kind`, `label`,
  `source` provenance and `coverage`. Optional fields are `network`, `asset`,
  `amounts`, `references`, `evidence` and string-only public `attributes`.
- IDs use a lowercase namespace and colon-separated local identifier. Interaction
  IDs include chain-bound provider, transaction hash and log index; overlapping
  claims deduplicate. Conflicting amount/recipient/fund/block/time claims are
  suppressed, never resolved by preferring a "verified" label.
- `network` has numeric `chainId` and a full EVM contract `address`. `asset` has
  `chainId`, contract `address`, `symbol`, and integer `decimals` (0–36). All
  non-null monetary values require this explicit asset and canonical unsigned
  uint256 **decimal strings**, not JavaScript numbers, decimals or exponent text.
  Null means unavailable. Display formatting never passes units through `Number`.
- Provenance states are `asserted`, `signed`, `self-published`,
  `mutually-acknowledged`, `observed`, `independently-verified`. These are distinct
  evidence classifications; schema validation alone verifies none of the claims.
  Providers must supply their verification policy and limitations. A verified
  wallet signature does not establish legal identity or project ownership.
- Normalized schema fields are strict: unknown fields/unsupported versions are
  rejected. Upstream additive fields are discarded through explicit allowlists;
  changed required fields, unknown event assets/funds, versions or verification
  policies invalidate that endpoint. No implicit migration or automatic version
  downgrade occurs. Future versions require explicit, tested migration adapters
  preserving provenance and unknown amounts; legacy creator/archive records need
  no migration.
- Transport: six fixed read-only GETs per expansion/refresh, omitted credentials,
  no redirects, `no-store`, 12-second per-source timeout, 1 MiB per-response limit,
  and independent endpoint failures. No localStorage, financial snapshot backup,
  error-to-empty-history fallback, or permanent financial cache. Source data older
  than 15 minutes is stale; open displays re-evaluate age without fetching.

### Valid non-Busking examples

This executable example uses the same common envelope for all six kinds. The
fictional token is not a real balance claim:

```js
const base = {
  schemaVersion: 1, label: 'Community garden public record',
  source: {
    id: 'garden:source:public', url: 'https://example.org/public',
    observedAt: '2026-10-23T15:00:00.000Z', verification: 'self-published',
    limitations: ['Steward-authored; not proof of ownership or legal identity.']
  },
  coverage: { state: 'partial', fromBlock: null, throughBlock: null }
};
const examples = [
  { ...base, id: 'garden:creator:demo', kind: 'creator' },
  { ...base, id: 'garden:project:demo', kind: 'project' },
  { ...base, id: 'garden:fund:demo', kind: 'fund',
    asset: { chainId: 1, address: '0x2222222222222222222222222222222222222222',
      symbol: 'TEST', decimals: 18 },
    amounts: { balance: '9007199254740993000001', reserved: null },
    references: { project: 'garden:project:demo' } },
  { ...base, id: 'garden:contract:demo', kind: 'contract',
    network: { chainId: 1, address: '0x2222222222222222222222222222222222222222' } },
  { ...base, id: 'garden:interaction:demo', kind: 'interaction',
    references: { fund: 'garden:fund:demo' }, attributes: { event: 'Pledge' } },
  { ...base, id: 'garden:relationship:demo', kind: 'relationship',
    references: { from: 'garden:creator:demo', to: 'garden:project:demo' },
    attributes: { relation: 'stewards' } }
];
examples.forEach(CanopyPublicSource.validateRecord);
```

The test suite contains these six examples and synthetic Busking fund/payout
examples, including exact values beyond JavaScript's safe integer range.

### Publication and privacy

This adapter reads already-public endpoints, never a local creator draft or
private API credential. Expanding sends the public endpoint request and the
browser's ordinary network metadata to that host, not a wallet identifier,
cookie or signature. Creators adding authored records must preview their public
IDs, wallet addresses, references, descriptions, source URLs, timestamps,
evidence and amounts before signing/publishing; signed/IPFS records may remain
public indefinitely. A signature is not required to read these public sources.
Never put private diagnostics, tokens, unpublished booking details, legal
identity claims or other private data in normalized records.

## Validation

```sh
node --test test/public-source.test.js test/project-details.test.js test/map-performance.test.js
node --test test/*.test.js test/*.test.mjs
```

Existing tests requiring ethers need the existing `relay` dependencies installed
(`cd relay && npm ci --ignore-scripts`). Tests mock source responses; live
source observations above are dated evidence, not deterministic fixtures or
promises about future uptime.
