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

1. Open **IPFS -> Pin it yourself** and copy the current backup CID.
2. On IPFS Desktop/Kubo, use the displayed `ipfs pin add <CID>` command; or use your own Pinata JWT in the pinning dialog to pin by CID.
3. The optional personal JWT goes only to Pinata, is not saved, and is cleared when the dialog closes. Do not publish it in a profile, issue or screenshot.
4. Keep your node/account available and pin updated backup CIDs. Signed creator exports can be independently pinned too.

## Request pinner rewards

Enter a public gateway URL, accept the commitment and **Sign & request to pin** with the wallet that should receive payment. Admin approval is required. The [GitHub pinner form](../.github/ISSUE_TEMPLATE/pinner-request.yml) is a fallback, not a Discord workflow.

[Weekly checks](../.github/workflows/pinning-rewards.yml) qualify matching bytes for the current CID or a recent CID from the previous eight days. The manifest's payload hash must match. The current policy queues **$0.10 USDC per qualifying pinner per ISO week**, at most 20 (earliest approvals first), maximum $2/week.

Qualification does not pay automatically. The approved wallet, available USDC and authorized router payout/ledger settlement are still needed. Policy lives in [community rewards](../community-rewards.json). There is no joining airdrop or reward for merely linking an Artizen account.

## Limits

Gateway availability is not proof of independent storage or unique participants. A gateway that fetches on demand can appear to serve a pin it does not retain. Prefer a dedicated pinned-content gateway or Kubo `Gateway.NoFetch = true`; sybil resistance and cryptographic storage proofs are not implemented.

Backing up JSON does not preserve every remotely hosted image or historical website. Public profiles and older revisions may persist forever; pin only data that was intended for publication.
