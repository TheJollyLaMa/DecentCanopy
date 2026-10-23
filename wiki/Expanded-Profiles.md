# Expanded creator profiles: storage design

[Wiki home](Home.md) · [IPFS & pinning](IPFS-and-Pinning.md) · [Creator guide](Creators-and-Archive.md)

**Status: design only, 2026-10-20. Not implemented or enabled.**
The steward chose to document the model before setting or enforcing an expanded
allowance. This document does not grant capacity, change rewards, or raise current
limits. It describes a staged extension of the existing creator publication path,
not a second profile system.

## Purpose

Creators who help keep DecentData available should be able to qualify for larger
public profiles. Supporting shared infrastructure can earn additional publication
capacity without requiring everyone to download a large profile to explore the map.

Pinning a DecentData backup does not by itself retain separate profile documents.
A CID identifies content; it does not guarantee continued availability. Gateway
checks demonstrate availability through that gateway at a time, not independent
storage, exclusive storage, proof of replication, identity, or ownership.

## Decisions and limits

| Topic | Decision |
| --- | --- |
| Basic discovery record | Keep small and wallet-signed; basic participation must remain useful without pinner status |
| Expanded content | Separate public IPFS JSON documents referenced by the signed discovery record |
| Qualification | Approved pinner, a successful DecentData check within the last eight days, and availability checks for the referenced profile content |
| Allowance | Not chosen; do not enable expanded publication until capacity and operational limits are approved |
| Lapse | Keep the basic profile and existing references; do not delete or silently rewrite signed records |
| Cash rewards | No changes to USDC amounts, settlement, or the 20-pinner weekly reward cap |
| Private data | Excluded; this is public publication, not private health-data storage |

The current validator limits normalized creator JSON to **16,000 UTF-8 bytes**,
not 16 KiB. The relay separately caps request bodies at 40 KiB. Existing project,
and note-count limits also remain in effect. The GitHub connector no longer applies
a five-repository-per-project cap; repository URLs share the whole-profile byte budget.
The profile byte limit is not a limit on all data already carried in the discovery
index: today the index contains the record and its signed message/envelope fields.
See [creator records](../scripts/creator-records.js) and [relay](../relay/server.js).

## Three layers

### 1. Discovery and authorization

The small record contains the creator's name, brief project summaries, stable keys,
and a bounded list of optional content references. Preserve the current wallet,
revision, previous-CID, consent, signature, and conflict-checking model.

A future reference needs:

- A stable section key and explicit scope: creator or an existing project key.
- A supported document kind and schema version.
- A concrete IPFS file CID, not an arbitrary remote URL or a mutable IPNS pointer.
- The exact serialized UTF-8 byte length and SHA-256 digest.
- A short human-readable label suitable for discovery without fetching content.

These fields are a proposed contract, not fields accepted by the current validator.
Use a new explicitly supported creator-record version for the extension. Keep all
existing version 1/2 canonical messages byte-identical and signatures verifiable.
Do not silently discard or reinterpret unsupported reference fields.

### 2. Expanded public content

Start with typed JSON sections, such as longer project descriptions, public
repository collections, and journey history. A section belongs to the wallet and
scope in its signed reference. Validate its format, version, schema, and scope,
then verify byte length, digest, and CID identity before treating it as published
profile content. A linked document does not prove its statements are true.

Treat the document bytes as immutable. Editing one section creates a new CID and
requires a signed root revision accepting that CID. This avoids re-signing all the
expanded content, but does not remove the need to sign a changed discovery record.
Unchanged section CIDs can be reused.

No recursive content trees, executable HTML, scripts, arbitrary embedded fetches,
or automatic media downloads in the first implementation. Images and other media
need separate retention and loading policies; a linked image is not automatically
covered by a JSON allowance.

### 3. Qualification and availability receipts

Keep service-generated check receipts separate from signed creator claims. A creator
cannot grant themselves expanded eligibility by adding a boolean to their profile.
Bind qualification to the publishing wallet, not a display name or an unverified
GitHub-to-wallet association.

For a new or changed expanded publication, the authoritative publisher must check:

1. The wallet has a current approved pinner registration. Record how that wallet
   was authorized; do not assume a GitHub-submitted reward address proves control.
2. A recorded DecentData availability pass is no more than eight days old. Reject
   missing, invalid, or future timestamps and explicitly failed latest checks.
   Reuse the current accepted-backup rules, rather than creating a conflicting CID policy.
3. The registered gateway serves every referenced expanded document. Check all
   sections in the candidate profile, not just the changed section.
4. Retrieved bytes match the signed byte length, digest, CID identity, supported
   schema, and declared scope. Size declarations alone are not enforcement.
5. The approved aggregate and per-document limits are met. These remain undecided.

Content-check receipts identify the wallet, candidate root revision, section key,
CID, observed bytes/digest, checked-at time, outcome, and an actionable failure
reason. Limit receipt history. A pass means availability observed, not permanent
retention; do not call it a storage proof.

The cash reward queue and its 20-recipient cap do not determine capacity eligibility.
An approved pinner who passes the checks can be eligible for expanded capacity even
when not selected for that week's cash reward.

## Publication and read flow

1. The editor displays exact basic-record bytes and proposed expanded bytes
   separately, explains public permanence, and previews selected sections locally.
2. The creator pins intended public sections through their own provider/node.
   Do not make the community upload an unlimited payload on the strength of a claim.
   Personal provider credentials must never enter profiles, relay payloads, or indexes.
3. The editor assembles references, requests public-publication consent, and signs
   the root update. Browser checks are helpful feedback, not authoritative approval.
4. The relay validates the envelope and performs bounded preliminary eligibility
   checks. The workflow independently rechecks signatures, revision/CID conflicts,
   eligibility, and exact content before indexing. Keep large document bodies out
   of GitHub dispatch payloads and the repository discovery index.
5. Pin the signed root, persist the index, and return an explicit publication receipt
   using the existing path. Pending, rejected, unavailable, and published remain
   different outcomes. A failed expanded check leaves the last published root intact.
6. Map loading reads small discovery records only. Opening a section fetches it on
   demand through a controlled gateway path, with bounded streaming, cancellation,
   timeout, digest verification, and explicit errors. Invalid content is not rendered
   as an empty successful profile.

Retries of an identical signed publication must remain idempotent. Existing roots
remain readable and exportable without rerunning eligibility checks on every view.
Make clear that a retry cannot promise an expired signature or stale revision will
be accepted.

## Qualification changes and retention

Use distinct states: not enrolled, pending approval, eligible, check failed, check
unavailable, and lapsed. Include check dates and reasons rather than collapsing all
states into "not pinned."

- Preserve basic publication, current identity, existing references, and export.
- Require renewed qualification for new or changed expanded sections. Allow basic
  edits and removal of references while retaining previously published references
  unchanged; enforce this by comparison with the authoritative current root.
- Do not refresh a content receipt merely because an unchanged CID was carried over.
- Explain unavailable sections and let creators re-pin or publish a replacement once
  eligible. A service outage must not be described as proof the creator stopped pinning.
- Do not automatically delete community-held copies or promise lifetime retention.
  Expanded content is creator-retained by default; community replication requires
  a separately approved budget and retention policy.
- Removal affects current discovery, not copies or historical IPFS revisions.

The existing DecentData backup packages JSON and the discovery index. Referencing
an expanded CID does **not** make that backup a recursive backup of its bytes.
Document which exact CIDs a pinner is expected to retain and how they update them.
Preserving old backup CIDs also does not automatically retain all profile revisions.

## Implementation gates

Before enabling the feature, approve:

- Total active expanded bytes per wallet, per-document size, reference count, and
  document/schema limits. Count each distinct CID once per wallet; separately
  account for request/metadata overhead and do not promise historical storage.
- Refresh cadence for profile-content checks and what freshness is required at
  publication; define a grace/notice period for lapses. Eight days currently applies
  to the DecentData qualification check, not a chosen content-retention guarantee.
- Expected aggregate pinning/index/checking load and funding for any community
  replication. Per-wallet limits alone do not prevent multi-wallet resource abuse.
- Safe gateway fetching: approved public destinations, private-network and redirect
  restrictions, bounded responses, concurrency, timeout, and rate limits. Never
  turn user-supplied gateway URLs into unrestricted server-side fetches.
- How capacity status reaches the editor without becoming a creator-signed claim.

Then implement in order:

1. Versioned schemas, byte/digest accounting, unchanged-signature compatibility, and
   clear size indicators; no automatic migration or larger default allowance.
2. Wallet-bound eligibility and bounded content-check receipts, independent of cash
   reward selection. Reuse existing pinner registration and accepted-backup evidence.
3. Self-pinning/editor flow and root publication with authoritative checks in both
   relay and workflow. Deploy validators before reference-bearing clients.
4. Lazy verified section loading, map summaries, qualification status, and export.

Acceptance tests must cover exact byte and freshness boundaries, multibyte text,
multiple sections and duplicate CIDs, rejected private/oversized/redirected fetches,
hash/CID mismatches, stale/conflicting roots, wallet changes, unavailable services,
lapse/requalification, basic edits/unlinking after lapse, and preservation of existing
signatures and cash-reward behavior. Verify production publication separately from
mocked pinning tests.
