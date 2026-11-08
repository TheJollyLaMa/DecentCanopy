# Marathon sprint: public evidence and direction

This is a bounded, steward-curated release record, not automatic whole-library
synchronization. A merged source change, frontend deployment and on-chain
deployment are different milestones. The sprint authorizes frontend releases
only; no new contracts, ENS transactions or fund movement.

## Administrative receivers

| Receiver | Public source | Independently verified locally |
| --- | --- | --- |
| Escrow | [PR #2](https://github.com/TheJollyLaMa/DecentEscrow/pull/2) | 25 checks; both headers and synthetic payment lifecycle |
| Invoice | [PR #2](https://github.com/TheJollyLaMa/DecentInvoice/pull/2) | 24 checks; both headers and synthetic payment lifecycle |
| Subscriptions | [PR #3](https://github.com/TheJollyLaMa/DecentSubscriptions/pull/3) | 31 checks; both headers and renewal/cancellation |
| NDA | [PR #2](https://github.com/TheJollyLaMa/Decent_NDA/pull/2) | 21 checks including 8 crypto checks; local roundtrip/privacy browser |
| Airdrop | [PR #4](https://github.com/TheJollyLaMa/DecentAirdrop/pull/4) | 31 checks; exact amounts, send gates and mobile header |
| UCAN | [PR #3](https://github.com/TheJollyLaMa/Decent_UCAN_Play/pull/3) | 22 checks; Vite build, both browser entries, public consent and JWT reload |
| Shared Head | [PR #35](https://github.com/TheJollyLaMa/DecentHead/pull/35) | 88 checks; explicit provider and full header browser |

These counts overlap older sprint coverage and are not a new aggregate of
unique scenarios. Pinata authentication and Kubo version response prove only
those endpoints responded, not uploads, retention, rewards or UCAN enforcement.
Contract source and simulated transfers are not audited deployed contracts.
NDA remains a local encrypted-package prototype requiring separate secure
passphrase exchange and a trusted reviewed page. UCAN's Pinata path is public
BYOK: Pinata does not enforce the browser-local delegation.

### Production frontend verification

All seven PRs above are merged. Their production Pages releases succeeded.
On November 8, the manager opened each actual deployed entry at 375px, verified
the real contextual header and About dialog, a disconnected wallet with no
authorization prompt, and no page errors. Escrow, Invoice and Subscriptions
also returned their generated ABI/runtime assets successfully. No connected
wallet transactions or live provider uploads were exercised.

- [Escrow](https://thejollylama.github.io/DecentEscrow/)
- [Invoice](https://thejollylama.github.io/DecentInvoice/)
- [Subscriptions](https://thejollylama.github.io/DecentSubscriptions/public/index.html)
- [NDA private package entry](https://thejollylama.github.io/Decent_NDA/private-agreement.html)
- [Airdrop](https://thejollylama.github.io/DecentAirdrop/)
- [UCAN modern built entry](https://thejollylama.github.io/Decent_UCAN_Play/modern.html)
- [Canonical Head](https://thejollylama.github.io/DecentHead/)

Pages publication does not repoint an existing ENS/IPFS snapshot. No new
Supporter mint, listing or announcement accompanies this header release.

Learning and public/community releases are separate lanes. Their published
PRs, production verification and blockers will be added as they clear review.
Unpublished worker drafts are not public evidence. Radio combined-distribution
licenses, current-main integration, CI and generated production assets remain
release gates where applicable. ArtFi/DLend/router migration is reserved for a
separate joint session.

## One Jolly Sim Siddhi product

**Jolly Sim Siddhi** will have one project site and one contextual header.
Arduino Smarthome is its efficient-home algorithm and sensor-sharing backbone;
Siddhi is the home-to-world HUD and eventual simulation surface. Both source
repositories remain visible for provenance. This direction is not a completed
physical repository merge, live hardware integration or sensor network.

DecentCanopy maps **creators and their projects**. Jolly Sim Siddhi will map
**homesteads and their projects**, offering accountability and assistance.
They have distinct concerns and possible interface crossovers. A homestead
may house many creators; a Canopy area may relate to zero, one or many
homesteads. Do not impose a one-to-one relationship.

GreenTeaHut is an example local project. It currently has a ledger; future
resource datasets would describe inputs, outputs and latent stores. Live
datasets, consented sharing, simulations and cadCAD integration require their
own scoped designs and receiving tests.
