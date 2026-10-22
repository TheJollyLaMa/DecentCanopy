# IPFS & community pinning

[Wiki home](Home.md) · [Admin playbook](Admin-Playbook.md)

## Three kinds of records

- **Creator records:** each wallet signs its own portable profile. The publication workflow pins the signed envelope and updates the discovery index.
- **The whole site:** [Pin Canopy Site to IPFS](../.github/workflows/pin-site-ipfs.yml) pins the website as one folder after each Pages publish. Open `https://<cid>.ipfs.inbrowser.link/` using the CID in [ipfs-site.json](../ipfs-site.json) or the header IPFS popover. Use a subdomain gateway so wallets and publishing work. The archive, bundled signed creators and Rabbit Hole (`/rabbit-hole/`) work from that copy; the relay, newest index, Pinata, PeerJS and RPCs are still servers. See [the README](../README.md#the-whole-canopy-on-ipfs).
- **Canopy backup:** [Pin Canopy Data to IPFS](../.github/workflows/pin-ipfs-backup.yml) packages the public dataset, creator index, archive manifest and reward settings. The IPFS header popover shows its CID/status.

The original frozen Artizen archive is preserved unchanged. A separate [all-seasons capture](../data/artizen-comprehensive-capture.json) records the public catalog and Season 0–7 financial tables, retrieval dates, source hashes and coverage gaps. Compressed original responses live in [source captures](../data/artizen-source-captures/) and are included in the whole-site IPFS snapshot; the JSON data backup includes the parsed comprehensive capture and earlier Season 7 capture. Empty tables and absent rows are not zero balances. This preserves the returned public evidence, not a guarantee that upstream Artizen records are complete or current.

The October 10 capture contains 3,251 distinct projects, including all 3,116 frozen catalog projects and curated/supplemental projects. 1,823 have at least one financial row; 1,428 have none. Returned financial rows by season: 0–3: zero rows, 4: 89, 5: 95, 6: 1,025, 7: 1,212. The public catalog is still dated September 7 and contains 250 funds and 9,547 relationships. These counts describe the available sources, not certified completeness of Artizen’s underlying records.

The community `PINATA_JWT` belongs in GitHub Actions secrets. It is never committed or supplied to the browser. A CID identifies content; it does not guarantee someone will keep serving it.

## Pin your own copy

1. Open **IPFS -> Storage providers · verify / recover** (or **Pin it yourself**). The existing forest header and reward-signup flow are preserved.
2. Choose **Pinata** or **IPFS Desktop / local Kubo**, then **Use provider**. Choosing a provider uploads nothing. Pinata retrieval needs no wallet or credentials; pinning needs your own JWT with `pinByHash` permission. No shared repository secret is exposed.
3. Choose **Verify published backup** to retrieve the latest published manifest and compare the returned byte length and SHA-256, then check the backup format/version and complete public file list. The limit is 20 MiB. Failures, wrong bytes and unavailable providers are errors, not successful pins.
4. To retain a public copy, check the explicit consent box and choose **Verify & pin public backup**. Verification happens before the pin request and again afterwards. Pin acceptance plus matching retrieval is not proof of durable retention, independent storage, reward qualification or payment.
5. The personal JWT is held only in the shared storage session for this tab, sent directly to Pinata and cleared when the dialog closes or the provider is reapplied. It is never saved in browser storage, a profile, issue or repository. A pin request already submitted may finish after closing; check your provider before retrying.
6. Manual fallback: copy the CID or `ipfs pin add <CID>` command and use Desktop/Kubo yourself. Keep your node/account available and pin updated backup CIDs. Signed creator exports can be independently pinned too.

### Local Kubo setup

The browser talks only to `http://127.0.0.1:5001`; it never sends Pinata credentials there. Start Kubo/IPFS Desktop with its API bound to loopback. Allow the exact Canopy origin in `API.HTTPHeaders.Access-Control-Allow-Origin` and POST in `API.HTTPHeaders.Access-Control-Allow-Methods`, then restart the daemon. For example, an origin is `https://thejollylama.github.io` (no repository path). Preserve other deliberate origin entries; do not use `*` or expose the API publicly. Browser local-network permissions or HTTPS mixed-content rules may prevent direct access: the manual pin command remains available and errors are displayed.

### Public backup recovery

**Verify & download recovery JSON** retrieves and verifies the exact published backup and downloads those original bytes. It does not overwrite the live creator index, re-sign profiles, publish records, replace the frozen Artizen archive, or restore anything to browser storage. Recovery is a portable dataset for offline inspection or steward-controlled repository recovery. Individual signed creator imports retain their separate signature-verification flow.

Only the existing allowlisted public datasets are included. Unpublished creator drafts, wallet secrets and local preferences are excluded. The shared file list is used by both the backup publisher and browser validator. The browser's hash comparison trusts the repository's published manifest, not an independent signature or a live-chain audit.

The storage session and host capability interface are pinned, unmodified DecentHead v2.0.0 modules (`072a5206489d0e4a3f2576c56f8debb729d933c9`). Canopy supplies its own public-backup validation and UI; this does not replace its Header renderer or claim the full Header consumer migration milestone.

## Request pinner rewards

Enter a public gateway URL, accept the commitment and **Sign & request to pin** with the wallet that should receive payment. Admin approval is required. The [GitHub pinner form](../.github/ISSUE_TEMPLATE/pinner-request.yml) is a fallback, not a Discord workflow.

[Weekly checks](../.github/workflows/pinning-rewards.yml) qualify matching bytes for the current CID or a recent CID from the previous eight days. The manifest's payload hash must match. The current policy queues **$0.10 USDC per qualifying pinner per ISO week**, at most 20 (earliest approvals first), maximum $2/week.

Qualification does not pay automatically. The approved wallet, available USDC and authorized router payout/ledger settlement are still needed. Policy lives in [community rewards](../community-rewards.json). There is no joining airdrop or reward for merely linking an Artizen account.

## Limits

### Proposed expanded profiles

The [expanded profile design](Expanded-Profiles.md) separates small signed discovery
records from larger, self-pinned public JSON sections. The chosen qualification
requires approved pinner status, a DecentData pass within eight days, and availability
checks of referenced profile content. **Design only:** no capacity allowance has
been chosen, no larger profiles are enabled, and reward amounts/caps are unchanged.
Pinning a backup does not automatically pin content referenced by CID inside it.

Gateway availability is not proof of independent storage or unique participants. A gateway that fetches on demand can appear to serve a pin it does not retain. Prefer a dedicated pinned-content gateway or Kubo `Gateway.NoFetch = true`; sybil resistance and cryptographic storage proofs are not implemented.

Backing up JSON does not preserve every remotely hosted image or historical website. Public profiles and older revisions may persist forever; pin only data that was intended for publication.
