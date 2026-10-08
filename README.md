# DecentCanopy

> **Extracted from [TheJollyLaMa/TheGreenTeaParty](https://github.com/TheJollyLaMa/TheGreenTeaParty)** — the fractal map + sidepanel + contract graph sub-system now lives here as its own standalone project.

**DecentCanopy** is a fractal constellation visualization and data layer for mapping multi-project stewardship, coordination, and public ledger associations across decentralized networks.

**The next chapter:** a wallet-authorized home for independent creators, their projects, progress and new funding sources. Artizen's existing project/fund graph is retained as a frozen historical archive, not a live platform connection. No record in that archive establishes whether a payout was or was not made. Creators may optionally document their own Artizen experiences, separately and explicitly as self-reports.

Public profiles are signed, portable IPFS records. For now, a community pinning account, relay and repository index provide publication and discovery; **discovery is not yet fully decentralized**. Anyone can retain the signed exports independently. There is no Artizen login, token requirement, or joining airdrop.

## Canopy wiki

Start with the [version-controlled wiki](wiki/Home.md): [creators & archive](wiki/Creators-and-Archive.md), [development payroll](wiki/Development-Payroll.md), [admin allocations & settlements](wiki/Admin-Playbook.md), [IPFS & pinning](wiki/IPFS-and-Pinning.md), and [deployment & troubleshooting](wiki/Deployment.md).
These pages live in this repository, not the separate GitHub Wiki, so documentation changes receive the same review as code.

## Overview

DecentCanopy provides:

- **Fractal Constellation View** — A Mandelbrot-inspired interactive spiral map displaying projects as nodes with dynamic zoom and pan controls
- **Association Mapping** — Visual representation of project relationships, shared funding pools, and curator overlap
- **Sidepanel Details** — Project information, season/phase context, parent/child relationships, and cross-project associations
- **Shared Data Layer** — Normalized access to projects, associations, activity, and metrics via `scripts/data-layer.js`
- **Artizen Snapshot** — Local JSON data derived from public Artizen season/funding records for deterministic rendering
- **DecentHead Header** — Animated forest canopy, About modal, IPFS status, and injected-wallet connection controls
- **Repo Payroll** — USDC rewards and an owner-gated Base Settlement Router panel, with legacy ledger compatibility retained
- **IPFS Canopy Backup** — Versioned public data snapshots pinned to IPFS through Pinata
- **Opt-in Participation** — Previewed browser-local imports, website-card drafts, season funding, and explicitly unverified activity replay
- **Public Wallet Links** — Ethereum, Optimism, and Base explorer links, matching-address associations, and requested read-only native balances
- **Distributed Globe** — Consent-based country/city/precise locations and symbolic off-Earth markers, with accessible card navigation
- **Decent Creators** — Wallet-authorized profiles, editable projects, journey updates, optional exit experiences, and prospective or reported funding sources
- **Community Pinning** — $0.10 USDC per qualifying pinner per week, capped at 20; availability checks and explicit settlement, not a promise of already-paid funds

## How to use everything (quick guide)

A hands-on tour of what's here. Each item links to the detailed section below.

### Visiting the canopy

1. Open https://thejollylama.github.io/DecentCanopy/. The whole canopy combines independent creators with the frozen archive; the **🧭 Tour** opens on a first visit and can be replayed from the toolbar.
2. **Explore:** scroll to zoom and drag to pan. Click any blip to open its card. Use **View** to switch between all entities, projects, funds, or creators, and search for anything by name. Selecting a fund opens its own fund canopy; use the return control to come back.
3. **Make it your view (optional):** in the tour, pick your creator card or add a local one. The canopy then opens on you. This is a browser-local preference; clear it from **Participate / import**.
4. **ⓘ Data notes:** the tab on the right edge holds snapshot dates, counts, and limits. Click to stash it.
5. **Canopy switch:** choose **Green Tea canopy** (or `/?canopy=green-tea`) for The Green Tea Party cluster.
6. **Globe view:** see creators, projects, and funds that opted in to a location. Drag to turn and select a marker to open its card.
7. **About** (click the header text): independent-creator mission, archive context, the wiki, contributor info, and community pinning. The separate **three-tree icon** stays visible but only opens administration for the registered owner wallet.

See [Features](#features) and [Artizen Canopy](#artizen-canopy).

### As a creator

- **Create / edit:** connect your wallet, then choose **My creator**. Fill in your name, bio, HTTPS website/avatar and optional location label. Add projects, status updates and new funding sources. Your connected wallet controls only its own new profile; an archived project link does not prove ownership or change that project.
- **Connect to other Decent creators:** link a project to **related Decent projects** (any wallet's). Point a funding source at a **Decent fund** on the canopy and, once paid, add the chain + transaction hash.
- **Run a fund:** choose **Add a Decent fund** to publish a fund blip you steward. Include its treasury (Base/Ethereum/Optimism) and the Decent projects it supports.
- **Line meanings:**
  - Dashed amber = claimed by one side.
  - Solid blue = confirmed by both wallets.
  - Glowing green = ledger-verified. A public-chain transfer was found from the steward's signing-wallet treasury to the creator's signing wallet.
  - See [Creators & the archive](wiki/Creators-and-Archive.md#how-lines-earn-trust).
- **Your journey:** add project progress and milestones. Optionally choose **Artizen experience**, write your account, attach an evidence URL, and select a self-reported payout experience—or leave it **Not shared**. No payout status is inferred. Do not publish anyone else's private information.
- **Preview:** consent to local storage and choose **Save draft & preview my blip**. This creates a browser-local, unsigned preview, not a public update.
- **Publish:** consent to public publication, then **Sign & publish to the canopy**. No payment, gas, GitHub account, Artizen identity, or token holding is required. A signature proves wallet control, not factual truth. The workflow verifies, pins and indexes the record; the dialog distinguishes pending, published and failed states.
- **Take your data with you:** **Sign & download portable record** exports the readable signed message. Restore it with the signed-import control while using the same wallet, or independently pin the JSON using Pinata/IPFS Desktop. Public IPFS copies and previous versions may persist permanently; clearing a local draft cannot recall them.
- **Local-only edits:** on any card, **Edit website / wallet / location** saves drafts in your browser only. **Participate / import** previews a participation JSON (website cards, season funding, boosts, purchases) and powers **Replay imported activity**. Nothing local is uploaded. See [Opt-in participation prototype](#opt-in-participation-prototype).
- **Public wallet utility:** a linked wallet shows explorer links on Ethereum, Optimism, or Base and can read its public native balance on request. A wallet link is not proof of identity or wealth.

### Pinning the canopy data (USDC program)

1. Open the **IPFS** popover in the header and click **📌 Pin it yourself**. Copy the CID, then either run the shown `ipfs pin add` command on your own node, or paste your own Pinata JWT to pin by CID. The JWT is used once in that tab and never saved or sent anywhere except Pinata.
2. In the same dialog (or About → Become a pinner), enter your public gateway URL, tick the commitment, and **Sign & request to pin**. Your connected wallet receives the rewards. The GitHub pinner form remains as a fallback.
3. After approval, weekly matching-byte checks qualify for **$0.10 USDC**, capped at 20 pinners (earliest approvals first). A gateway check shows availability, not proof of exclusive storage. Queued is not paid; settlement depends on USDC funding. See [Community Rewards](#community-rewards).

### Contributing code and ideas

1. About → **File an Issue** to join the contributor whitelist (GitHub username + wallet).
2. Pitch ideas or pick up funded issues labeled `bounty: <amount> USDC`. Idea authors share 20% via `idea-credit: @username`. Testing issues use `test-bounty:` with `/test-complete`.
3. Merged pull requests queue payouts automatically in `payroll-queue.json`. See [Contributor Payroll](#contributor-payroll).

### Admin (repository owner) playbook

- **Admin opener:** connect the registered owner wallet (`role: "owner"` in `contributor-accounts.json`, currently TheJollyLaMa). The **three trees** spin and sparkle, enlarge on hover/focus, and open the admin workspace independently of About. For everyone else they remain a quiet, inactive part of the title. Reduced-motion preferences suppress animations. The owner-only **💸 Payroll** toolbar button remains a shortcut.
- **Allocations & deposits:** expand **Fund allocations & USDC deposits**, inspect an exact slug, then create it with a public HTTPS/IPFS metadata URI (requires `DEFAULT_ADMIN_ROLE`) or deposit Base USDC into an existing active allocation. The panel confirms approvals and deposits, links transactions, checks account/network again before each send, and never requests unlimited approval. Inspect again after a write to refresh its balance. Creation does **not** change payroll routing or activate incentives. Current dev and pinner queues both target `decentcanopy-repo-dev`; separate buckets for pinning, onboarding or tasks are future configuration work. See the [admin playbook](wiki/Admin-Playbook.md).
- **Payroll & settlement:** expand **Payroll & pinner approvals**, review entries, and pay on Base. Then run **Settle Payroll** with the confirmed payout hash (roles: contributor, implementer, idea-originator, tester, legacy airdrop, pinner). The router's `PAYROLL_ROLE` and owner-wallet checks authorize payment; hiding controls is not security. Deposits and approvals are **not** settlement transactions.
- **Reviewing in-app pinners:** the owner-only Payroll panel lists new pinner requests. Add a note and sign **Approve** or **Reject**. Creator profile publication does not need owner approval; valid signatures, bounded payloads and version checks authorize it.
- **GitHub-form fallback:** comment `/pinner-approved` on a pinner request issue to add the pinner; `/pinner-recheck` retries the availability check. Joining airdrops are retired and cannot be approved through the former commands.
- **Weekly pinning check:** **Community Pinning Rewards** runs every Monday (or on demand) and opens a `pinning-check` issue with the results.
- **Reward relay:** the in-app buttons post to the relay on Render (see [In-app requests and the relay](#in-app-requests-and-the-relay)). If it is down, the dialogs say so and link to the GitHub forms.
- **IPFS backup:** **Pin Canopy Data to IPFS** runs on data pushes and daily. It needs the `PINATA_JWT` Actions secret, which is never committed or exposed to the browser.
- **Frozen archive:** do not refresh Artizen data. `scripts/sync-artizen-data.js` refuses to overwrite it while `data/artizen-archive.json` is frozen. Existing snapshot, curation and legacy ledger history are retained.
- **One-time setup:** see the [maintainer setup checklist](#setup-checklist-maintainer).
- **Before pushing:** `node --test` and `node scripts/validatePayrollQueue.js`.

## Architecture

```
DecentCanopy/
├── index.html                    Main constellation view (app entrypoint)
├── .env.example                  Environment variable template
styles/
├── spiral.css                    Canvas, toolbar, sidepanel & legend styling
├── decent-head.css               Forest header and responsive wallet/IPFS controls
├── participation.css             Consent, import, profile and globe dialogs
└── onboarding.css                Beginner tour and About "Build the canopy with us" styles
scripts/
├── config.js                     Chain IDs, supported networks, contract address slots
├── mode-router.js                Resolves prototype vs app mode from URL
├── network.js                    Chain ID parsing & supported-chain helpers
├── contract-adapter.js           Public contract ABIs + read/write placeholder calls
├── data-layer.js                 Shared data access module (GTPData)
├── payroll.js                    Multi-currency payroll parsing and ledger rules
├── payroll-admin.js              Wallet-gated shared-router payout panel
├── router-admin.js               Named allocation inspection, creation and exact USDC deposits
├── data-adapter/
│   ├── interface.js              Adapter method contract & validation
│   ├── mock-adapter.js           Local Artizen JSON loader (prototype mode)
│   ├── app-adapter.js            On-chain data adapter (app mode, wires contract-adapter)
│   └── artizen-adapter.js         Public project/fund graph and curated creator links
├── spiral.js                     Canvas fractal map — rendering, pan/zoom, interaction
├── decent-head.js                Wallet connect and IPFS status header behavior
├── participation-model.js        Validates reported data, wallet/location links and ledger reads
├── participation.js              Browser-local consent, imports, edits, exports and deletion
├── canopy-globe.js               Opt-in Earth/space projection and accessible card navigation
├── artizen-account.js            Retained legacy module (not loaded by the site)
├── creator-records.js            Canonical wallet-signed profile schema and independent verification
├── ledger-proof.js               Public-RPC transfer checks for ledger-verified funding lines
├── decent-creators.js            Creator editor, local drafts, signed exports and public cards
├── publishCreator.js             Verify, pin and index creator publications
├── onboarding.js                 First-visit tour, local "your view" preference, data-notes drawer
├── pinDataBackup.js              Packages public canopy data and pins it to IPFS
├── data/
│   ├── projects.json             Artizen project records (season, phase, outcome, funding totals, …)
│   ├── associations.json         Relationship edges (source, target, type)
│   └── activity.json             Public season/funding activity feed
```

The header and About modal share tree-lined SVG pathways and species-specific canopy-to-canopy
critter routes. Modal critters stop when it closes; reduced-motion preferences disable movement.
Artizen labels in the body toolbar and About modal use the logo also used by ArtFi.

### Flow

```
index.html
  └─ loads scripts in order:
       config.js        → GTPConfig  (chain IDs, contract address slots)
       mode-router.js   → GTPModeRouter  (prototype | app)
       contract-adapter.js → GTPContractAdapter  (ABIs + call stubs)
       data-adapter/interface.js  → GTPDataAdapterInterface
       data-adapter/mock-adapter.js → GTPMockDataAdapter
       data-adapter/app-adapter.js  → GTPAppDataAdapter
       data-adapter/artizen-adapter.js → GTPArtizenDataAdapter
       participation-model.js → validation and read-only ledger helpers
       participation.js → consented, browser-local overlay
       data-layer.js    → GTPData  (loads + normalises data via active adapter)
       canopy-globe.js  → opt-in globe and card-selection events
       spiral.js        → renders fractal canvas, wires sidepanel & filters
```

- **Prototype mode** (default): `GTPData` uses the local Artizen JSON snapshot; no wallet or chain needed.
- **App mode** (`?mode=app` or path `/app`): `GTPData` uses `GTPAppDataAdapter` which delegates reads/writes to `GTPContractAdapter`. Contract addresses are configured in `scripts/config.js` (or loaded from environment at build time — see `.env.example`).

## Data Schema

### Projects (`data/projects.json`)

Each project record requires:

```json
{
  "id": "artizen-s1-example",
  "name": "Project Name",
  "track": "Season 1 · Founding",
  "status": "funded",
  "raised": 7800,
  "goal": 12000,
  "season": 1,
  "seasonTitle": "Season 1 · Founding",
  "phase": "closeout",
  "fundingOutcome": "winner",
  "communityRaised": 5400,
  "matchFunding": 2400,
  "artifactSales": 340,
  "stewards": 8,
  "description": "...",
  "location": "Portland, OR"
}
```

**Required fields:** `id`, `name`, `track`, `status`, `raised`, `goal`  
**Common optional fields:** `season`, `seasonTitle`, `phase`, `round`, `fundingOutcome`, `communityRaised`, `matchFunding`, `artifactSales`, `lastUpdate`, `publicUpdate`, `stewards`, `description`, `repoUrl`, `artizenUrl`, `nextAction`, `location`

### Associations (`data/associations.json`)

Defines relationships between projects:

```json
{
  "source": "proj-001",
  "target": "proj-002",
  "type": "collaboration"
}
```

**Required fields:** `source`, `target`  
**Optional fields:** `type` (e.g., `collaboration`, `shared-steward`, `research-link`, `funding-pool`)

### Activity (`data/activity.json`)

Public season/funding entries for the activity feed:

```json
{
  "type": "allocation-finalized",
  "title": "Season allocation settled",
  "date": "2026-07-30",
  "projectId": "artizen-s1-example",
  "amount": 2400
}
```

**Required fields:** `type`, `title`, `date`  
**Optional fields:** `projectId`, `amount`

## Development

This repository intentionally favors **zero build-step, zero npm** minimal dependencies — plain HTML/CSS/JS served statically.

**Setup:**

```sh
# 1. Clone
git clone https://github.com/TheJollyLaMa/DecentCanopy.git
cd DecentCanopy

# 2. (Optional) copy env example — only needed when wiring real contracts
cp .env.example .env
# Edit .env with RPC URLs and deployed contract addresses
```

**Run locally:**

```sh
# Option 1 — open directly in a browser (some fetch() calls may not work due to CORS)
open index.html

# Option 2 — use a simple static server (recommended)
npx serve .
# or: python3 -m http.server 3000
```

Then visit `http://localhost:3000` (or the port shown by `serve`).

**Modes:**

| Mode | URL | Data source |
|------|-----|-------------|
| Whole canopy (default) | `/` | Frozen historical graph plus separate Decent Creator records |
| Decent Creators | `/?canopy=creators` | Wallet-authorized profiles, independent projects, funding sources and journey records |
| Artizen archive | `/?canopy=artizen` | Unchanged historical project/fund snapshot and separately attributed curation; no new creator overlay or local annotations in this view |
| Green Tea canopy | `/?canopy=green-tea` | The Green Tea Party and its directly associated curated project cluster |
| App | `/?mode=app` or `/app` | On-chain via `GTPContractAdapter` (requires wallet + configured addresses) |

## Features

### Interactive Canvas

- **Zoom & Pan:** Scroll or use ±buttons to zoom; drag to pan
- **Focus Mode:** Click a project node to focus its branch context
- **Association Toggle:** Toggle visual connection lines on/off
- **Breadcrumb Navigation:** Navigate through focused hierarchy

### Details Sidebar

Click any project node to open a details panel showing:

- Track and status badge
- Description and priority information
- Funding progress bar
- Parent/ancestor relationships
- Child/descendant projects
- Associated projects (shared stewardship, collaboration, research links)
- Project and fund artwork from the Artizen public index, and a creator's profile picture when one is curated

### First visit: tour, your view, and data notes

- **🧭 Tour** opens automatically on a first visit and can be replayed from the toolbar. It explains projects, funds, creators, lines, and halos, then points to TheJollyLaMa's card as a filled-in example.
- **Make it your view** is optional. A visitor can keep exploring, pick an existing creator card as "me", or add a local creator card (name, HTTPS website, and an `artizen.fund` profile link) with explicit local-storage consent. After that, the canopy opens on that card. This is a browser-local preference, not verified ownership. Clear it from **Participate / import**.
- **ⓘ Data notes** is a tab on the right edge (docked to the details sidebar when it is open). It holds the snapshot date, counts, and data limits. Stash it with one click; the choice is remembered. It opens automatically inside a fund canopy, where it holds the "return" control.

### Filtering

- Filter by season track (e.g., "Season 1 · Founding", "Season 2 · Public Goods")
- Filter by status/phase (e.g., "curation", "competition", "funded", "archived")
- Search by project name or description

## Artizen Canopy

The default landing view includes the historical graph; `/?canopy=artizen` isolates the **frozen archive**:

- Artizen project and fund records appear as distinct node types.
- The public index's `submitted`, `curated`, and `funded` project-to-fund relationships are rendered as connections, with season metadata retained where present.
- Search covers names, descriptions, tags, and facets. The **View** filter switches between all entities, projects, funds, or creators and their connected project neighborhood.
- The historical **TheJollyLaMa** creator node and its stated project associations are retained separately in `data/artizen-curation.json`, with rationale shown on each curated edge. qArt-code remains a curated entry outside the checked-in index. New profiles do not replace this curation.
- The side panel labels the source of each relationship. Curated links are dashed and gold; Artizen-index links remain separate.
- Selecting any fund opens a focused fund canopy: projects directly linked to that fund, plus their direct links to other projects, funds, and creator nodes. The summary distinguishes direct Artizen project–fund records from locally curated links, and the return control restores the complete Artizen view.

The Artizen matching index used for this snapshot does not include creator fields, project fundraising totals, artifact-purchase records, or proof of public-ledger transactions. Individual Artizen project pages may provide creator bylines, but the importer does not crawl thousands of detail pages; creator links are therefore limited to the local curation file for now. This view does not infer or display missing data as fact. In particular, an Artizen `funded` relationship is shown as a source relationship record, not as a verified on-chain transaction.

The browser reads the checked-in `data/artizen.json` rather than requesting Artizen. All existing seasons and relationship labels are retained unchanged. The archive manifest records the source date and freeze policy. Source labels such as `funded`, historical fund availability and dated totals **do not establish that any payout was or was not made**. No further Artizen refresh is expected; the old sync command is explicitly disabled.

Choose **Green Tea canopy** in the canopy switch (or open `/?canopy=green-tea`) to focus on The Green Tea Party and directly associated projects such as DecentCanopy, Green Tea Party Kiln, and Green Tea Hut #1. This focused view uses the same Artizen snapshot and only includes locally curated `associated-project` links for this cluster.

### Opt-in participation prototype

**Participate / import** accepts a previewed, versioned JSON file with explicit consent to browser-local storage. Nothing is uploaded, published to IPFS, or sent to Artizen. Wallet connection is optional and does **not** authenticate an Artizen account or prove ownership. Artizen credentials and session cookies must never be entered or imported. Website editing on data cards is a local annotation, not an authorized owner update. Direct HTTPS links are required; misleading links and concealed destinations are not appropriate.

The legacy local-import prototype remains available for retained history. It does not automate boosting or access Artizen accounts. New public editing uses the independent wallet-signed creator system, not an Artizen integration. The archive-only view excludes local overlays.

Imports are limited to 2 MB and 1,000 records per array. Saving replaces the prior imported bundle, preserving separately edited website, wallet, and location drafts. Download the local bundle to retain it or revoke consent to delete it from this browser. Downloads and any copies made elsewhere are not deleted by revocation. Local imports are **excluded** from repository IPFS backups.

Use this schema (the button downloads a minimal starter template). Existing project/fund IDs are available in the website editor; newly introduced creators use `local-creator:` IDs. This is a DecentCanopy exchange format, **not** a claim that arbitrary Artizen exports already match it:

```json
{
  "format": "decentcanopy-participation",
  "version": 1,
  "coverage": "My partial history, season 7; not a complete lifetime record",
  "entities": [
    {
      "id": "local-creator:me",
      "kind": "creator",
      "name": "My display name",
      "websiteUrl": "https://example.org"
    }
  ],
  "connections": [],
  "events": []
}
```

Existing entity records may include `funding: { "raised": 500, "goal": 1000, "currency": "USD", "season": 7, "asOf": "2026-10-03T12:00:00Z" }`. These are season-specific participant claims, displayed with their timestamp, not instant statistics. Only USD is supported for funding comparisons; fund availability is not treated as money raised. Node halos scale logarithmically with reported raised USD and do not imply creator wealth. Records without funding remain visible and are not treated as zero-funded.

Connections contain `source`, `target`, and one of `creator-associated`, `collaboration`, `fund-member`, or `fund-steward` (creator → fund only). Events contain a unique `id`, `target`, `date` (ISO timestamp), positive `amount`, and `type`: `boost`, `purchase`, or `counter-change`. A purchase requires `currency: "USD"`; boost and counter-change amounts are whole **boost counts**, not spent point balances. Optional `actor` must reference a creator. Aggregate `counter-change` records cannot have an actor. Do not include private buyer identities without their permission.

All imported records remain **participant-reported, unverified**, regardless of any supplied verification flags. Creator cards summarize attributed boosts by destination within the imported coverage only—not a verified all-time tally. **Replay imported activity** animates visible targets chronologically, with larger purchase pulses and smaller boost pulses; actor journeys remain unverified and counter changes have no actor. Historical playback is compressed, not a live event stream. Reduced-motion preferences disable replay. Neither purchases nor boosts automatically alter fundraising totals, avoiding double counting.

#### Participate through a card

1. Search for a project, fund, or creator, open its side-panel card, and choose **Edit website / wallet / location**.
2. Review the browser-local storage consent. Add a direct HTTPS website and save the website draft separately.
3. Enter a public EVM address and choose **Ethereum**, **Optimism**, or **Base**, or use the connected wallet address. Blank the address and save to remove the link.
4. Separately opt in to a location. Choose a city/country label, coordinates at your preferred precision, or **Off Earth**. Save wallet/location to persist these drafts.
5. Open **Globe view** to turn and tilt the globe, follow connections, and select a marker or its accessible list entry to return to the card.

To introduce a new creator, download the participation JSON template, replace the display name and `local-creator:me` identifier, and add permitted links/data before previewing and saving it. No user authentication or verified owner edits are claimed in this prototype. Shared community publishing and Artizen account linking remain future work requiring approved integration and authentication.

#### Public wallets and ledger utility

Entity import records optionally accept:

```json
{
  "publicWallet": {
    "address": "0x1111111111111111111111111111111111111111",
    "chainId": 8453
  },
  "sharedLocation": {
    "consent": true,
    "precision": "city",
    "label": "My chosen city",
    "latitude": 40.7,
    "longitude": -74.0
  }
}
```

These are fields within an entity, not a standalone import. The address above is an example, not a real participant association. Addresses are normalized to lowercase; invalid/zero addresses and unsupported networks are rejected. Each card links directly to that chain's public explorer. Profiles declaring the same address **on the same chain** gain a `shared-public-wallet` graph connection. A shared treasury does not imply the same person owns the projects. These links remain participant-declared and unverified.

**Read public native balance (provider request)** explicitly queries the injected wallet provider on the selected chain for `eth_blockNumber` and `eth_getBalance`. It does not request a signature, send payments, switch networks, scan transaction histories, or contact a separate RPC service configured by DecentCanopy. The provider may contact its configured RPC operator, which learns the queried address. Results show ETH, block number, and read time; they are provider-reported, ephemeral, and not saved/exported. The selected network must match; network changes and malformed responses surface errors.

A public balance is **not** Artizen fundraising, verified income, or personal wealth. Wallet ownership, Artizen account ownership, purchase attribution, and transaction semantics are not established by a link or balance lookup. Future verified ledger activity needs chain-specific receipt/log validation and an approved way to tie records to the appropriate Artizen entities. The graph separates declared associations from public ledger observations.

#### Historical creator cards

The Artizen account/login preview is retired. Historical profiles and curated associations remain archived; no new integration or authenticated collections are promised. **Create / edit my Decent Creator** opens a separate wallet-authorized profile rather than claiming ownership of an archive card.

#### A filled-in creator canopy: TheJollyLaMa

`data/artizen-curation.json` shows what a fully connected creator card looks like. Every field is public and labeled with its source:

- **Profile picture** — `creator.image` (TheJollyLaMa's Artizen creator avatar, the public image shown beside their posts and profile on Artizen), labeled by `imageSource`. Project and fund cards show their artwork from the Artizen public index; clicking the artwork opens the real Artizen page (`artizen.fund/index/p/<slug>` for projects, `artizen.fund/index/mf/<slug>` for funds, or a curated `artizenPageUrl`). Add `creator.artizenPageUrl` to make the avatar open the creator's Artizen profile.
- **Projects** — Decent Jukebox (now [DecentBusking](https://thejollylama.github.io/DecentBusking/)), BigNuten, qArt-code, The Green Tea Party, Green Tea Hut #1, DeCent Canopy, and ArtFi. Each has its website, its GitHub repo, its Artizen project page, and the [A Decent Agency Discord](https://discord.gg/tkBfwT3YMN), where every project has a channel.
- **Projects you support** — Green Tea Party Kiln is **Mama's project**. It sits in The Green Tea Party envelope; TheJollyLaMa supports it with creator-declared `boosted` and `collected-artifacts` edges. It never counts as TheJollyLaMa's project or toward their total. Related projects (one hop of `associated-project`) are not pulled into a creator's own project list.
- **`publicStats`** — the "Total", boosts, boost bonus, and season-7 fund submissions read from each public Artizen project page. They're dated (`capturedAt`) and are not live. Project halos use these totals for brightness when no participant-reported funding exists.
- **`artizenProfile`** — the PRO badge, bio, boost points, ART tokens, recent boosts, and `stewardship: []` (shown as **None**), all read from the public creator profile.
- **No fund memberships** — every fund submission is still pending review, so none is shown as membership (`fundMembershipNote`). The account panel lists **Fund submissions** (submitted, curated, or funded records from the public graph) and says plainly that a submission is not membership. Season submissions on project cards are marked "pending review" (`publicStats.submissionStatus`).
- **`boosted` edges** — a recent boost whose project is in the index (Marsita the Ultra), plus the Kiln. Other recent boosts are listed by name only.
- **Artifact associations** remain creator-declared `collected-artifacts` edges, not a verified collection.

Use **My creator** for new records rather than rewriting historical curation. Historical links may no longer resolve, and remote artwork is not guaranteed to remain available.

#### Location choices and privacy

- **Country:** label-only is supported; supplied coordinates are rounded to whole degrees.
- **City:** label-only is supported; supplied coordinates are rounded to one decimal.
- **Precise:** both coordinates are required and retained up to six decimal places.
- **Off Earth / space:** the label is retained; Earth coordinates are discarded. A random symbolic position outside the globe is chosen for the page session, stable through redraws—not an astronomical position.

**Request my precise browser location** requires the separate location checkbox and the browser's geolocation permission. It fills the editor only; saving still requires your choice. Browser accuracy is reported, not guaranteed. Results arriving after closing the editor or withdrawing location consent are discarded. No automatic GPS request, address lookup, reverse-geocoding, or third-party map/geocoder calls occur. City/country names without coordinates appear in the accessible list but are not plotted at invented coordinates.

The globe is an orthographic, schematic latitude/longitude sphere, not a country-boundary basemap. Far-side Earth markers are hidden until the view is turned; space markers remain symbolic. Connections are recorded graph associations, not flights, proximity proof, or money transfers. The Green Tea globe is restricted to that canopy's project cluster; the Artizen globe includes all locally opted-in entities, independent of search filters.

Location and wallet drafts persist only in browser storage with the rest of participation data, are included in explicit downloads, and are **not** in automatic IPFS backups. Precise locations plus public wallet addresses can expose identity, home/work locations, and financial activity. Share only what participants permit; opt-in is not a reason to republish someone else's private data. Uncheck location consent and save to remove that card's location, or revoke participation consent to delete all local data. Already exported copies cannot be recalled.

### IPFS Backup

The **Pin Canopy Data to IPFS** workflow publishes the public canopy JSON datasets under `data/` (including the full Artizen snapshot and creator curation), plus the payroll queue, contributor wallet registry, and asset configuration, as a versioned JSON bundle on Pinata's public IPFS network. It runs when those source datasets change on `main`, once a day (to pick up bot commits, which do not trigger push workflows), or on manual dispatch. The workflow updates `data/ipfs-backup.json` with the latest CID, the bundle's `payloadSha256`/`payloadBytes`, and up to 10 `recentCids`; the header's IPFS status control reads that public manifest and links to the backup.

Before using it, create a Pinata JWT limited to public file uploads and add it to the repository's Actions secrets as `PINATA_JWT`. Never put the token in browser code or commit it. The workflow reports missing credentials or upload failures instead of claiming success. The bundle is content-addressed; unchanged source data reuses the existing pinned backup.

The backup also includes the public community registries (`data/community-creators.json`, `data/community-pinners.json`). It includes contributor wallet addresses and payroll ledger data. As with the repository itself, these records are public; IPFS copies are content-addressed and may remain available independently of later repository edits.

## Community Rewards

The community pinning program queues **USDC** through the existing payroll. Settings are in [`community-rewards.json`](community-rewards.json). New creator profiles have no joining reward and require no historical token verification. Legacy records are retained, not deleted.

### Weekly USDC for community pinners

Anyone can help keep the dataset decentralized:

- **Pin it yourself:** open the header **IPFS** badge → **📌 Pin it yourself**. Copy the `ipfs pin add <cid>` command for your own Kubo node, or pin by CID with your Pinata account. The Pinata JWT is used once in that tab, sent only to `api.pinata.cloud`, and never stored. A scoped, revocable key is best.
- **IPFS Desktop:** import from IPFS using the backup CID and retain the pin. Rewards additionally need a public HTTPS gateway that serves pinned data; a local desktop pin alone cannot be remotely verified by the current checker.
- **Qualify for USDC:** serve your pin from **your own** gateway, then sign up in the **📌 Pin it yourself** dialog. The signing wallet is your Base reward wallet. Never paste API keys into the gateway or signup fields.
  - The **In-App Rewards** workflow checks your gateway right away and records the request for review.
  - The owner approves you from the Payroll panel, which adds you to [`data/community-pinners.json`](data/community-pinners.json).
  - Fallback: the [`pinner-request.yml`](.github/ISSUE_TEMPLATE/pinner-request.yml) issue form, with `/pinner-recheck` and `/pinner-approved` comments.
- **Weekly check:** **Community Pinning Rewards** runs every Monday, and you can also dispatch it manually.
  - It fetches `<gateway>/ipfs/<cid>` for the current backup CID, or any `recentCids` entry from the last 8 days.
  - A pass requires the bytes to hash to the manifest's `payloadSha256`.
  - Passing pinners get **$0.10 USDC** queued (role `pinner`, up to 20 per week, earliest approvals first; maximum $2/week at the current cap).
  - The results go in a public `pinning-check` issue, and the check runs at most once per ISO week.
  - The IPFS popover shows how many community nodes passed this week.

A gateway check shows that the data is **available** through that gateway. It is not proof of independent storage. Please serve only content you have pinned, for example with a Pinata dedicated gateway or Kubo with `Gateway.NoFetch = true`. Sybil resistance and storage proofs remain limitations. Queued rewards are public obligations, not confirmed payments; funding and authorized Base settlement are required.

### Wallet-authorized creator publications

[`creator-records.js`](scripts/creator-records.js) defines bounded, canonical, readable signed messages. A profile contains a wallet, revision, previous CID, timestamp, name/bio/HTTPS links, optional location consent, projects, Decent funds, funding sources and journey records.

- Limits: 20 projects, 10 funds, 30 funding sources, 40 journey updates and 16 KB per canonical profile. Longer histories can be retained in independent exports.
- Format version 2 adds:
  - `funds[]`: name, purpose, status, optional `treasury {chain, address}`, and `supports` (Decent project IDs).
  - Per-project `wallet` and `related` (Decent project IDs).
  - Per-funding `fundRef`, `chain` and `txHash`.
  - Version 1 records stay valid with their original canonical form.
  - References must be `decent-project:<wallet>:<key>` or `decent-fund:<wallet>:<key>`; same-wallet references must exist in the record.
- Claims across wallets become map edges: `claimed` (one side), `mutual` (both wallets) or `ledger`. [`ledger-proof.js`](scripts/ledger-proof.js) checks a referenced transaction's receipt over public RPC (Base, Ethereum, Optimism). It requires success and either a native transfer or an ERC-20 `Transfer` log from treasury to recipient. It upgrades an edge only when the treasury is the steward's signing wallet and the recipient is the creator's signing wallet. Verified proofs are cached in `localStorage`, and at most 25 transactions are checked per load.
- Project ownership and historical links are self-reported. Existing historical records cannot be overwritten by creator publications.
- Funding stages distinguish exploring, applied, pledged, received and ended. Amounts are optional and require a currency; the map does not aggregate unlike currencies or assume any receipt.
- Artizen-experience updates default to **Not shared**. Other selectable statuses are received, partially received, not received, uncertain and not applicable. All are explicit creator reports, never platform conclusions.
- The relay verifies the signature and forwards `creator-publish`. [`creator-publish.yml`](.github/workflows/creator-publish.yml) verifies it again, requires the next revision and matching previous CID, then pins the signed envelope using the Actions `PINATA_JWT` secret. It indexes the record in [`data/decent-creators.json`](data/decent-creators.json), alongside explicit success/error receipts.
- Retry of an already-published identical version is idempotent. Stale/conflicting versions must be reloaded and signed again. Publication requests expire after six hours; the relay requires a fresh signature within ten minutes. Published signatures remain verifiable without an expiry. Concurrent publishers use bounded optimistic index-update retries rather than a GitHub concurrency group that could discard pending requests.
- The browser verifies indexed signatures with ethers before adding them to the map. An unavailable or invalid creator index is reported without hiding the historical archive.
- Exports contain the original signed message and signature. Other tools can recover its EVM signing wallet and validate the schema without trusting the repo or Artizen. Keep the export, pin it yourself, or reference its CID elsewhere.
- Updating removes a profile only from the latest discovery index, not from old IPFS copies. There is no wallet-recovery or public-profile removal flow yet. Lost signing keys cannot be recovered by a login.
- This bootstrap still depends on the relay, GitHub index and community pinning availability. It does not claim censorship-resistant discovery or permanent availability from a single pinning account.

### In-app requests and the relay

The browser never holds a GitHub token or the community Pinata token. Creator publishing, pinner signup and owner reviews use the Render relay:

1. **Browser** builds a readable message with [`creator-records.js`](scripts/creator-records.js) or [`reward-messages.js`](scripts/reward-messages.js) and asks the connected wallet to sign it (`personal_sign`, no transaction).
2. **Relay** ([`relay/server.js`](relay/server.js), hosted on Render) does the following:
   - checks the origin allowlist, the 16 KB body limit, the signature, a 10-minute freshness window, nonce replay, and rate limits per IP and per wallet
   - validates the payload with the same normalizers as the workflow
   - forwards the request as a `repository_dispatch` event
   - serves `GET /requests/<id>` status from `data/community-requests.json`
   - serves `GET /publications/<id>` status from the creator index; publication versions use previous-CID/revision checks rather than reward nonces
3. **Workflows** re-verify signatures, persist creator publications or pinner registries, and publish explicit outcomes. Former airdrop endpoints return a retired-program error.

Only the owner wallet (`role: "owner"` in `contributor-accounts.json`) can sign `reward-review` decisions. Every request, its signed message, and the decision are public in `data/community-requests.json`.

**Deploy the relay on Render:**
1. New → Blueprint, pick this repository. [`render.yaml`](render.yaml) defines the `decentcanopy-relay` web service (`npm ci --prefix relay`, `node relay/server.js`, health check `/health`).
2. Set the `GITHUB_TOKEN` environment variable in Render to a **fine-grained personal access token** limited to `TheJollyLaMa/DecentCanopy`, with *Contents: Read and write* (needed for `repository_dispatch`) and *Metadata: Read*. Never commit it. That permission can also push to the repository, so treat the token like a deploy key: keep it only in Render, consider branch protection on `main`, and rotate it if it leaks.
3. Keep `ALLOWED_ORIGINS=https://thejollylama.github.io` (comma-separated; add `http://localhost:3000` for local testing).
4. If the service URL differs from `https://decentcanopy-relay.onrender.com`, update `relay.url` in [`community-rewards.json`](community-rewards.json).

Run the relay locally with `npm ci --prefix relay`, then set secrets in your environment and run `node relay/server.js` (port 8787). Render's free tier sleeps when idle; submissions wait up to 75 seconds. Public publication confirmation polls for up to five minutes and reports unconfirmed status rather than claiming success.

### Setup checklist (maintainer)

- Add the `PINATA_JWT` Actions secret with public upload permission. **Publish Decent Creator** uses it for onboarding; **Pin Canopy Data to IPFS** publishes the whole dataset. Include creator index, archive manifest and reward settings in backups. Pinner qualification requires an actual published backup CID.
- Deploy the relay ([In-app requests and the relay](#in-app-requests-and-the-relay)).
- Set **Settings → Pages → Source → GitHub Actions**. [`publish-site.yml`](.github/workflows/publish-site.yml) deploys `main` on pushes and after creator/reward/backup workflows; bot commits otherwise do not trigger regular push deployments.
- Create `pinner-request` and `pinning-check` labels for the GitHub fallback and weekly receipts.
- Fund and activate the shared router's `decentcanopy-repo-dev` allocation with **Base USDC**, approve that asset and recipients, and grant the settlement wallet the necessary router role. Configuring rewards does not fund the router. Settle confirmed pinner transactions with role `pinner`, currency `USDC`.

## Data Layer API

The `GTPData` module exposes:

```javascript
// Load data
GTPData.load(basePath)

// Selectors
GTPData.getProjects()
GTPData.getAssociations()
GTPData.getActivity()
GTPData.getProjectById(id)
GTPData.getNeighborIds(id)  // Find related projects via associations
GTPData.buildAdjacency()    // Build full graph
GTPData.getMetrics(projects)  // Aggregate metrics
GTPData.getFilterOptions()  // Available tracks, statuses, locations, and entity kinds
GTPData.filterProjects(state)  // Apply filters

// Filter state
GTPData.getFilterState()  // Returns a snapshot copy { track, status, search }
GTPData.filterState  // { track, status, search } — legacy direct reference (read-only intent)
GTPData.setFilter(key, value)
GTPData.onFilterChange(callback)
```

## Core Principle

> If a feature increases engagement but decreases agency, don't build it.
> If a feature decreases engagement but increases agency, seriously consider building it.

DecentCanopy prioritizes stewardship visibility and cross-project coordination over engagement metrics.

## Contributor Payroll

New contributors: open **About → Build the canopy with us → File an Issue**. It opens the [`contributor-request.yml`](.github/ISSUE_TEMPLATE/contributor-request.yml) template (GitHub username, wallet, what you want to help with, links) so the owner can whitelist you in `contributor-accounts.json`. Then pitch ideas or pick up bounty issues.

Merged pull requests can queue new rewards from linked issues labeled `bounty: <amount> USDC`. Duplicate labels for the same token are rejected. Optional `idea-credit: @username` splits each bounty 80/20; amounts beyond ledger precision are rejected, not rounded. Testing uses `test-bounty: <amount> USDC`, `/test-complete`, and owner-only `/test-approved`. Legacy asset configuration remains only for historical ledger compatibility and settlement.

Only registered wallets can receive entries: bounty, idea, and testing roles use `contributor-accounts.json`; `airdrop` entries must pay the verified Artizen wallet recorded for that claim in `data/community-creators.json`; and `pinner` entries must pay an approved wallet in `data/community-pinners.json`. GitHub Actions add entries to `payroll-queue.json` and accrue per-token account totals. Token addresses, decimals, the shared Base router, and the configured `decentcanopy-repo-dev` fund slug are in `payroll-assets.json`.

Connect the registered repository-owner wallet in the header; click the **three trees** (or the owner-only **💸 Payroll** shortcut) and expand **Payroll & pinner approvals**. The icon's activation is only a UI gate; the router role and owner checks below are the real authorization. The panel checks Base, the router's `PAYROLL_ROLE`, fund status/balance, token approval, contributor identity, and on-chain work-reference replay protection before offering a payout. If a recipient has not yet been approved on the shared router, the panel can add them only when the connected wallet also has `CONTRIBUTOR_ADMIN_ROLE`; it never revokes or changes other repositories' contributor approvals.

The `decentcanopy-repo-dev` fund must be created, active, and funded on the existing shared router before payouts can succeed; supported assets must also be router-approved. The repository configuration does not deploy a router or create/fund this allocation. After the panel confirms a `payout()` transaction on Base, run the owner-only **Settle Payroll** GitHub Actions workflow with the exact contributor, issue, role, currency, and confirmed transaction hash. That workflow moves only the matching entry to settled and commits the ledger update to `main`; it does not send the payment itself. Do not run it before the on-chain transaction is confirmed.

The header's animated forest and critters remain. Its text opens About with the independent-creator mission, archive provenance, public-data consent, wiki, open-source contribution links and community pinning; the separate tree control opens only the admin workspace.

Validate locally with:

```sh
node --test
node scripts/validatePayrollQueue.js
```

## Next Steps

- Contract adapter for reading project registry and treasury data on-chain
- Multi-network support (Ethereum, Optimism, Base, others)
- Live data integration from public ledgers
- Cross-repository project discovery
- Quadratic funding and governance primitives

## Known Limitations / Assumptions

- **App mode is a scaffold.** `GTPAppDataAdapter` and `GTPContractAdapter` return placeholder results until real contract addresses are configured in `scripts/config.js` and a wallet provider is present.
- **No build step.** Scripts are loaded as plain `<script>` tags in order. There is no bundler or tree-shaking; all global variables (`GTPConfig`, `GTPData`, etc.) are intentional.
- **CORS on file://**: `fetch()` calls to local JSON fail when opening `index.html` directly from the filesystem. Use a local HTTP server (`npx serve .`).
- **Data views have separate source scope.** `/` combines independent creators and history; `/?canopy=creators` isolates new creator records; `/?canopy=artizen` isolates the frozen archive. Historical remote artwork/links may become unavailable.

## Attribution

DecentCanopy is an extraction of the DeCentCanopy sub-system originally developed as part of **[TheJollyLaMa/TheGreenTeaParty](https://github.com/TheJollyLaMa/TheGreenTeaParty)**.

Files faithfully extracted from that project (commit `310c4cc`):

| File | Origin |
|------|--------|
| `scripts/spiral.js` | `TheGreenTeaParty/scripts/spiral.js` v0.33 |
| `scripts/data-layer.js` | `TheGreenTeaParty/scripts/data-layer.js` |
| `scripts/contract-adapter.js` | `TheGreenTeaParty/scripts/contract-adapter.js` |
| `scripts/config.js` | `TheGreenTeaParty/scripts/config.js` |
| `scripts/mode-router.js` | `TheGreenTeaParty/scripts/mode-router.js` |
| `scripts/network.js` | `TheGreenTeaParty/scripts/network.js` |
| `scripts/data-adapter/*` | `TheGreenTeaParty/scripts/data-adapter/*` |
| `styles/spiral.css` | `TheGreenTeaParty/styles/spiral.css` |
| `data/*.json` | `TheGreenTeaParty/data/*.json` |

## License

GNU General Public License v3.0