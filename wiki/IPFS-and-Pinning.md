# IPFS & community pinning

[Wiki home](Home.md) · [Admin playbook](Admin-Playbook.md)

## Two kinds of records

- **Creator records:** each wallet signs its own portable profile. The publication workflow pins the signed envelope and updates the discovery index.
- **Canopy backup:** [Pin Canopy Data to IPFS](../.github/workflows/pin-ipfs-backup.yml) packages the public dataset, creator index, archive manifest and reward settings. The IPFS header popover shows its CID/status.

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
