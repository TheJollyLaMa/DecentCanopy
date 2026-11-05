# Reuse-first build workflow

Before adding a feature or substantial repair, ask: **what have we already built that can meet this need?**

The [DecentAgency capability map](https://thejollylama.github.io/DecentCanopy/?canopy=agency) is a starting point. Open **Offers & needs** for focused needs, grouped donor offers, source evidence and per-application validation steps. The [inventory](../data/agency-map.json) is curated and dated: a missing donor means unreviewed or unestablished reuse, not that no implementation exists.

## Before implementation

1. Define the receiving application's need and measurable acceptance test.
2. Check the relevant inventory offers/needs and their evidence. Inspect actual source and tests at the current revision; do not equate similarly named features with compatibility.
3. Inspect recent issues, PRs and relevant local branches/worktrees. Uncommitted work may already implement the repair. Preserve it; coordinate ownership before editing or integrating it. A merged PR does not prove deployed behavior.
4. Choose direct reuse, adaptation, extraction for established consumers, or new code. State why. Do not create a shared framework just because several apps might need one someday.
5. Check runtime/dependency versions, authentication, data formats, storage lifecycle, chain/asset identity, privacy, license/attribution and deployment assumptions. Test the receiver's differences and failure paths.

Search proportionately: inspect the likely donors first, broaden when necessary, and report the actual scope. This is not a requirement to read every repository on every small edit.

## Reuse decision and delivery evidence

### Voyager v1 release and host clones

The stable `asteroid` map node now points to
[`DecentVoyager`](https://github.com/TheJollyLaMa/DecentVoyager).
The v1.0.0 Supporter mint (token 80 / listing 10) has published, dated Base
verification. Its original frozen metadata retains the pre-rename repository
identity; no source archive or token metadata was rewritten.

The Planning Office reuses its existing receipt-backed floor, billboard and
sidepanel checkout helpers for this edition. A playable end-of-track clone is
still [proposed in Office #20](https://github.com/A-Decent-Agency/a-decent-agency.github.io/issues/20),
with [donor pointers on Busking #243](https://github.com/TheJollyLaMa/DecentBusking/issues/243#issuecomment-6670391716).
Do not equate Voyager's 20-sector gauntlet with Busking's 100-level, fixed-roster,
beat/weekly-playlist specification. Both hosts need lifecycle and replay-adapter
acceptance. Game prize tables are not funded inventory; the observed prize
contract holds zero units of all configured rewards.

### Selected November receivers

Steward direction on 1 November 2026 puts **DecentPilgrimages** and **BabelBet**
in Next, with distinct acceptance scopes:

- [Pilgrimages V1](https://github.com/TheJollyLaMa/DecentPilgrimages/issues/5):
  newly versioned Base contracts, organizer-approved rewards, optional location
  guidance, shared Decent welcome and user-owned records. Contract, experience
  and contributor-operations workers report evidence to the integration overseer.
- [BabelBet preparation](https://github.com/TheJollyLaMa/BabelBet/issues/4):
  shared experience and contributor workflow only. No new game, wager, oracle
  or official/unofficial Duolingo request; provider permission and etiquette
  remain prerequisites for a future build.

The [Office towers](https://a-decent-agency.github.io/) link workers to public
acceptance issues and real milestones. Head v2.0.0 is a proposed reusable donor,
not proof of either receiving application's adoption. Both repos prepare the
existing accepted-work payroll queue/receipt workflow; activation remains
steward-gated. Tutorial completion is not payment eligibility. Assistant setup
is likewise not activation, and private location/contributor data is not public
inventory evidence. Historical review dates and source-observed offers below
are not refreshed merely because new work was selected.

Include this short record in the implementation PR or task outcome, not a new tracking file for every task:

| Field | Record |
|---|---|
| Need | Receiving repo, behavior and acceptance criterion |
| Existing work checked | Donor repo, exact source path/symbol and inspected commit; label branch-only or uncommitted work explicitly |
| Decision | Reuse / adapt / extract / build new, with reason and limitations |
| Validation | Receiving-app test, result, remaining uncertainty and required deployment order |
| Follow-through | Consumer PR/commit and directly related inventory/docs update, or explain why no public update is appropriate |

Source links should identify an inspected commit where available. Keep historical inspection dates honest; do not refresh a whole inventory's review date after reviewing one item.

After delivery, update the directly related offer/need/crossover and evidence when there is approved public evidence. Use the [existing schema and capability states](../scripts/data-adapter/agency-adapter.js), not invented readiness fields. An issue is an expressed need, inspected code is not an integration test, and a proposed crossover stays proposed unless the schema and evidence support a different claim. Never mark a need resolved from a donor's existence alone.

## Boundaries and persistence

- The public map does not crawl source or watch local worktrees. Its data is not a live or exhaustive code index.
- Local/private discoveries can guide authorized work but must not be copied into public inventory, screenshots or PR descriptions without approval. Do not upload health data or credentials to validate reuse.
- Automation must not revoke OAuth authorization, sign wallet publications, send payments, change ENS, restart production workers or publish private data as a routine compatibility test.
- Personal Copilot instructions can make this check part of future sessions across repos. User-level instructions are personal, not part of this repository; discovery depends on the selected client/harness. This guide does not install instructions on contributors' machines.

For Copilot sessions, the supported user instructions folder is `~/.copilot/instructions`. This location is available to Copilot clients but does not itself roam through VS Code Settings Sync. Instructions guide agent behavior; they are not deterministic enforcement hooks.
