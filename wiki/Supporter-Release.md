# DecentCanopy Supporter release readiness

## Scope and approval boundary

Audit date: 2026-11-05. Receiving app: DecentCanopy, independently of Calendar,
Pilgrimages, Head, Market or BigNuten. Recommended first tag: **v0.1.0**, an early
version, not a claim that the platform/ArtFi roadmap is complete. Recommend a
regular GitHub release visibly labeled **beta / preview**;
[draft release notes](Release-Notes-v0.1.0.md) are ready for owner review. No published
GitHub releases or local version tags were returned during this audit.

Work is based on fetched `origin/main` **fa3dd5366810184c9c15cc8915a5ac02e0fe6075**
in the dedicated `chore/canopy-supporter-release` worktree. Scheduled data/pin
commits may advance main independently. Neither the dirty original checkout nor
`canopy-november-sweep` is an integration source for this change.

Approved preparation terms:

- Base (8453), **1,000 editions**, **10 USDC** each (`10000000` six-decimal units).
- Existing NFT: `0xe63EC9f8228720bAAC2fD528C0A6d06B3Dc5439B`.
- Existing community escrow: `0x31b07b83e99A9bdF379bf40225b8A80d3804C89d`.
- **No Canopy token ID, listing ID, release CID or ENS deployment is assigned.**
- No new wallet/signing implementation. Support is optional, not equity,
  ownership, a reward guarantee, yield or a financial-return promise.

This change does not merge a PR, close an issue, create a tag/release, dispatch a
workflow, mint/list, update ENS, deploy, read/copy secret values or delete branches.
The existing publishing workflows continue their own independent operation.

## Own edition versus ecosystem inventory

`data/supporter-dnfts.json` is a discovery snapshot for **other projects**. Its
2026-11-05 snapshot has no token name/metadata/project index matching DecentCanopy.
Base reports 77 registered IDs and 7 listings, with 38 indexing issues;
Optimism reports 22 registered IDs and 7 listings, with 21 issues. Both chains
are **partial**. Some metadata is stale or unavailable; absence from this index
does **not** prove universal on-chain absence or exhaust every contract/chain.
The scanner enumerates configured registry/escrow IDs, bounded at 10,000, not
every NFT ever deployed. No mint is authorized merely by this negative search.

The About dialog therefore says **preparing / purchase unavailable**, with an
actually disabled button, no fabricated token art and no purchase URL. The
map's BigNuten 76, Head 70 and Market 71 remain their own independent tokens.
Keep this boundary when refreshing the scheduled inventory.

After published release, mint and listing evidence is available, review the
repository/tag/commit, correct contract and token, escrow/listing, price/payment
token, stock, supply and confirmations against the immutable manifest. Only
then add the existing validated DecentHead buyer route (not wallet code here),
with exact chain/escrow/listing parameters. Recheck availability in that buyer;
retain unavailable/inactive/sold-out/error states. A discovered metadata match
alone is insufficient evidence to enable the own-project card.

## Reuse decision

Need: archive a version, show an honest own-project support state and reuse the
existing reviewed mint/announcement path without duplicating signing code.

- Canopy's `data/agency-map.json` `decent-canopy.offers` supplies public
  discovery and evidence-aware map cards; its needs keep fund evidence and
  integration onboarding separate from supporter sales. This remains a
  curated lead, not live whole-library synchronization.
- Inspected DecentHead donor
  `426ccb7ad8de658cda374b11ebc4b544b35257e6`,
  `templates/supporter/supporter-release.yml`,
  `templates/supporter/supporter-announce.yml` and the reusable workflows.
  Adopted the parent's published static-root-compatible kit
  **2b87543db1ff5c44c720e5c7f782386bbd702bc1** in both `uses` and `head_ref`.
  The shared kit owns rendering, exact-tag archives, manifests and announcements;
  Canopy does not extract another helper.
- Inspected BigNuten `js/supporterToken.mjs`, especially
  `validateSupporterConfig` and `validateSupporterListing`. Adapted only the
  honest unavailable-state concept. Its configured token 76 and wallet
  controller are **not** transplanted: Canopy has no own published evidence.
  Existing Apache-2.0/NOTICE attribution stays intact; no donor wallet source
  was copied.
- Receiving-app acceptance: About cannot offer a purchase before evidence;
  caller pins match and terms/root are explicit; BigNuten's latest live state
  is preserved. `test/supporter-release.test.js` passes, along with the full
  **302-test** Node suite.

## Exact app root, rendering and publication

- Entry: repository-root **`index.html`**. Static files are served from root,
  no frontend build/package installation needed. `site_root: '.'`.
- The existing Pages/IPFS publisher's public allowlist is
  `scripts/siteFiles.js`: `index.html`, `assets`, `styles`, `scripts`, `data`,
  `rabbit-hole` and the four named public account/payroll/reward JSON files.
  `node scripts/siteFiles.js <staging-directory>` stages that website.
- The shared kit at the pinned revision selects non-dot tracked files below
  `site_root` at the exact tag. At `'.'`, this is broader than Canopy's Pages
  allowlist (also includes tracked docs, tests, relay source and public media).
  It does not include ignored/untracked local files or secret values. Source
  archive remains the entire tagged repository. Review the site pin contents
  and size before approving metadata; do not describe the two publishers as
  producing identical site CIDs.
- The **Render blueprint is the optional publishing/OAuth relay**, not the
  static frontend: `npm ci --prefix relay --omit=dev`,
  `node relay/server.js`, `/health`. Do not deploy the relay as the card site.
- Shared renderer serves the tagged site separately from Head card assets,
  uses a clean Chromium context, reduced motion and a five-second settle.
  Canopy also loads CDN/browser assets and public data; inspect the actual
  preview for missing map data or network/script failures.
- **Art gate:** a clean visit to `/` can open the first-visit tour. For a map
  preview use `/?canopy=agency` (the Agency-ready event bypasses onboarding),
  or dismiss the tour deliberately before capturing; do not change visitors'
  onboarding just to render art. The pinned reusable workflow does not yet
  expose a product URL/query input. Coordinate that kit capability with the
  parent before dispatch or manually verify/correct art before mint approval.
  Do not mint a tour overlay or call an uninspected screenshot approved.

## Workflow and configuration gates (#34 remains open)

New `supporter-release.yml` calls prepare for a published release or explicit
tag dispatch. It passes `1000`, `10000000` and root `'.'`; no transaction key
is present. `supporter-announce.yml` calls the same immutable Head kit and
remains gated on `vars.SUPPORTER_DISCORD_ENABLED == 'true'`.

Cross-project coordination update (2026-11-05): Calendar's public readiness
commit `f4a03dc` and Pilgrimages `28567d7` are preparing their own v0.1.0
beta/previews, not minted editions. The parent reports Pinata privately
configured and verified for both repositories; no secret values were accessed
here. Their separate app roots remain `decent-calendar-vanilla/` and `public/`.
Office `ad034c1` observes all three projects among 19, with receipt gates;
observation is not mint/listing evidence. No new ENS names are assumed.

Names only were inspected with `gh secret list` / `gh variable list`:
`PINATA_JWT` exists; `DISCORD_SUPPORTER_WEBHOOK` and repository ENS variables
were not listed. Secret names/configuration do not prove credentials work.
Do not read, duplicate or publish secret values.

Remaining steward gates, in order:

1. Review/merge the dedicated changes through the normal owner process;
   preserve newer scheduled snapshots. Approve deferred scope below.
2. Resolve/verify the render-art gate above. Configure an approved
   `SUPPORTER_ENS_NAME` controlled by the steward; the existing curated
   `decentcanopy.eth` label is not proof of control or deployed content.
   Do not invent a `decentagency.eth` subname.
3. Configure the Discord webhook only through repository settings; keep
   announcement disabled until prerequisites are ready. Verify Pinata
   capability without reading its value.
4. Approve the version/tag and publish intentionally; inspect prepared
   source/site/art/metadata/manifests and the mint issue. Preparation does not
   authorize a transaction.
5. Steward mint/list/signing and ENS updates remain separate, explicit
   approvals. Verify public receipts and at least 12 confirmations, then add
   the own-project buyer route and evidence. Announce only when the verified
   ENS site serves the intended release.

## Every open issue: disposition, not blanket closure

19 open issues returned on 2026-11-05; no issue was closed or represented as
fully accepted by this audit.

| Issue | Disposition for v0.1.0 |
| --- | --- |
| [#6](https://github.com/TheJollyLaMa/DecentCanopy/issues/6) Community rewards setup | Retain. Pinata name exists; funding, labels and real reward acceptance remain operator gates. No funding transaction here. |
| [#7](https://github.com/TheJollyLaMa/DecentCanopy/issues/7) In-app reward queues | Existing signed-request UI/tests retained; defer final live relay/admin/settlement acceptance to next version. Queued is not paid. |
| [#9](https://github.com/TheJollyLaMa/DecentCanopy/issues/9) Reusable platform epic | Next-version roadmap, not a release blocker or completion claim. |
| [#10](https://github.com/TheJollyLaMa/DecentCanopy/issues/10) ArtFi epic | Defer until separate ArtFi modernization/version/mint gate. Preserve independent project roles. |
| [#11](https://github.com/TheJollyLaMa/DecentCanopy/issues/11) GitHub connection | Public self-declared repository linking exists; identity verification/non-maintainer acceptance remain next version. |
| [#12](https://github.com/TheJollyLaMa/DecentCanopy/issues/12) Opt-in structured participation | Keep existing forms; defer full external creator/steward/fund journey acceptance. |
| [#13](https://github.com/TheJollyLaMa/DecentCanopy/issues/13) Evidence visualization | Curated graph exists; generic real external fund interactions remain next version. |
| [#14](https://github.com/TheJollyLaMa/DecentCanopy/issues/14) Busking public ledger adapter | Preserve shipped source and unavailable states; defer end-to-end live fund acceptance. |
| [#15](https://github.com/TheJollyLaMa/DecentCanopy/issues/15) Radio media endpoint | Existing integration/widget and tests retained; verify actual browser codecs/service reachability separately. |
| [#16](https://github.com/TheJollyLaMa/DecentCanopy/issues/16) Participation/provenance guidance | Existing guides retained; external newcomer acceptance next version. |
| [#17](https://github.com/TheJollyLaMa/DecentCanopy/issues/17) Provider-neutral schema | Keep current adapters; generic external fund/schema contract work next version. |
| [#18](https://github.com/TheJollyLaMa/DecentCanopy/issues/18) ArtFi profile blip | Defer live integration pending #20; do not imply verified deployment. |
| [#19](https://github.com/TheJollyLaMa/DecentCanopy/issues/19) ArtFi funding view | Next version after deployment/evidence gate. |
| [#20](https://github.com/TheJollyLaMa/DecentCanopy/issues/20) ArtFi deployment verification | Retain blocking gate for ArtFi only; no contract writes or inferred funding history. |
| [#21](https://github.com/TheJollyLaMa/DecentCanopy/issues/21) ArtFi end-to-end tests | Defer until verified source/contract integration exists; Canopy mocks are not live financial acceptance. |
| [#22](https://github.com/TheJollyLaMa/DecentCanopy/issues/22) Giving/receiving guidance | Defer verified ArtFi routes; keep current historical/personal-report boundaries. |
| [#34](https://github.com/TheJollyLaMa/DecentCanopy/issues/34) Standard Supporter pipeline | Caller configs and preparing About state delivered here; configuration/render/mint/ENS/announcement gates still open. |
| [#57](https://github.com/TheJollyLaMa/DecentCanopy/issues/57) Shared city entry/plans | Explicit next-version planning epic; no automatic city synchronization or Office edits here. |
| [#59](https://github.com/TheJollyLaMa/DecentCanopy/issues/59) Web3Blend/Market map flow | Next version: verify donor source/license and add proposed relationships separately. No projects merged. |

## Only open PR: #58

Reviewed [#58](https://github.com/TheJollyLaMa/DecentCanopy/pull/58),
`chore/bignuten-v33-inventory` at
`3cc6c0091d32a1f219481ebc3e9710cac43a3525`, both from its merge base and **directly
against current main**, including all four changed files and its two passing
checks (no submitted reviews). Main already includes
`2ccb65cc3f49798e92ebe9f8b88e82fbb9b64d15`, the newer live token/ENS evidence.

Do **not** wholesale replace main's card or cherry-pick the older inventory.
That would replace main's live-update wording, lose #417 evidence and introduce
time-sensitive “only open #412 / all non-DeFi closed” assertions. The release
asset `supporter-art-refresh.json` was fetched read-only from BigNuten's public
v3.3.0 release and verified to preserve old/new CIDs for token 76, unchanged
supply/price/listing and the recorded URI-update transaction. Beneficial change
adapted: add that art-history evidence to **main's existing** live update, keep
#416/#417 links, ENS and token/listing terms, and add independent regression
coverage. Remaining broad inventory rewrite explicitly deferred. PR stays
open for owner reconciliation; do not auto-close it as merged.

## Every remote branch and cached tracking ref

`gh api .../branches --paginate` and `git ls-remote --heads origin` agreed on
**5 actual remote branches** at audit (before this delivery branch is pushed).
Fetch was deliberately **not pruned**: stale local tracking refs are not live
remote branches and no deletion is authorized.

| Actual remote branch | Disposition |
| --- | --- |
| `main` | Baseline; never merged into or overwritten by this task. Scheduled snapshots can advance independently. |
| `chore/bignuten-v33-inventory` | PR #58, selective verified adaptation above; remainder deferred. |
| `preserve/2026-11-03-bignuten-nutrition` | `02c4f8d`: `git cherry` marks patch already integrated; preserve, no duplicate merge. |
| `preserve/2026-11-03-supporter-release-links` | `3ac3852`: release-site/ENS card links are patch-equivalent to main; preserve, no duplicate merge. |
| `preserve/2026-11-03-ens-community-layout` | `fe3ea7b`: unique 14-file historical layout patch, related behavior already present on main. No wholesale transplant into newer graph/layout. Defer remaining differences to next-version layout review. |

The following **25 additional cached refs** were inspected using ancestry,
`git cherry`, scoped diffs and existing receiving tests; none appeared in the
live remote listing. They remain untouched:

| Cached `origin/` ref | Disposition |
| --- | --- |
| `chore/bignuten-level1` | Two unique historical inventory/test patches; newer BigNuten card supersedes their context. Defer residual review, no rollback. |
| `chore/bignuten-level2` | Patch-equivalent already integrated. |
| `chore/bignuten-level3` | Patch-equivalent already integrated. |
| `docs/bignuten-cited-nutrition` | Patch-equivalent already integrated. |
| `docs/bignuten-genie-access-394` | Patch-equivalent already integrated. |
| `docs/bignuten-nutrition-390` | Patch-equivalent already integrated. |
| `docs/bignuten-portion-scaling` | Two unique historical inventory/test patches; defer remaining claims against newest BigNuten evidence, no blind transplant. |
| `docs/bignuten-shared-foods` | Patch-equivalent already integrated. |
| `docs/green-tea-hut-v2-treasury-card` | Ancestor of main, no outstanding commits. |
| `feat/agency-capability-crossovers` | Ancestor of main. |
| `feat/agency-cid-pins` | Patch-equivalent already integrated. |
| `feat/agency-map-github-links` | Ancestor of main. |
| `feat/agency-repo-pins` | Patch-equivalent already integrated. |
| `feat/busking-public-funds` | Ancestor of main. |
| `feat/creator-journey-closeout` | Ancestor of main. |
| `feat/cross-project-pulses` | Ancestor of main. |
| `feat/map-dropdown` | Ancestor of main. |
| `feat/pilgrimages-babelbet-placement` | Patch-equivalent already integrated; new Pilgrimages release evidence remains its separate owner's responsibility. |
| `feat/public-ipfs-controls` | Ancestor of main. |
| `feat/repository-activity` | Ancestor of main. |
| `feat/reuse-first-desk` | Ancestor of main. |
| `feat/standalone-dbusk-radio` | Ancestor of main. |
| `feat/supporter-dnfts` | Ancestor of main. |
| `fix/busking-null-compatibility` | Ancestor of main. |
| `test/github-connector-acceptance` | Ancestor of main. |

“Ancestor” and “patch-equivalent” establish no missing commits in that comparison;
they are not claims of live acceptance or permission to delete preserved work.
Unique deferred patches are not release dependencies.

## Validation and limitations

- Targeted release/map/community/inventory/site-pinning run: **53 passed**.
- Full `node --test test/*.test.js test/*.test.mjs`: **302 passed** after the
  coordinated pending-preview map followup (initial readiness run: 301).
- Restored existing relay dependencies with `npm ci --prefix relay --omit=dev`
  only after the full suite reported missing `ethers`; audit reported no
  vulnerabilities. No manifest changes.
- Updated the prior “mint remains deferred” regression to the new preparing /
  purchase-unavailable boundary, without relaxing mint-evidence checks.
- Local integrated-browser smoke at 1440px and 375px: About dialog opened
  through its existing click event; own card has a disabled button, correct
  unavailable status, only the issue-preparation link, and no dialog horizontal
  overflow. `/?canopy=agency` did not show the tour. This is a markup/browser
  smoke, not a wallet or card-art approval.
- `git diff --check` passes. No chain writes, live checkout, production relay,
  ENS control, Discord delivery or exact-tag workflow dispatch was exercised.
- Release card art still requires the explicit render gate above; Node tests
  validate markup/configuration, not an approved minted card screenshot.
