# DecentCanopy

> **Extracted from [TheJollyLaMa/TheGreenTeaParty](https://github.com/TheJollyLaMa/TheGreenTeaParty)** — the fractal map + sidepanel + contract graph sub-system now lives here as its own standalone project.

**DecentCanopy** is a fractal constellation visualization and data layer for mapping multi-project stewardship, coordination, and public ledger associations across decentralized networks.

## Overview

DecentCanopy provides:

- **Fractal Constellation View** — A Mandelbrot-inspired interactive spiral map displaying projects as nodes with dynamic zoom and pan controls
- **Association Mapping** — Visual representation of project relationships, shared funding pools, and curator overlap
- **Sidepanel Details** — Project information, season/phase context, parent/child relationships, and cross-project associations
- **Shared Data Layer** — Normalized access to projects, associations, activity, and metrics via `scripts/data-layer.js`
- **Artizen Snapshot** — Local JSON data derived from public Artizen season/funding records for deterministic rendering
- **DecentHead Header** — Animated forest canopy, About modal, IPFS status, and injected-wallet connection controls
- **Repo Payroll** — ART/USDC bounty ledger and an owner-gated Base Settlement Router payout panel
- **IPFS Canopy Backup** — Versioned public data snapshots pinned to IPFS through Pinata
- **Opt-in Participation** — Previewed browser-local imports, website-card drafts, season funding, and explicitly unverified activity replay
- **Public Wallet Links** — Ethereum, Optimism, and Base explorer links, matching-address associations, and requested read-only native balances
- **Distributed Globe** — Consent-based country/city/precise locations and symbolic off-Earth markers, with accessible card navigation
- **Creator Artizen Space** — Creator cards with profile picture, projects, websites, Discord, dated public totals, supported projects, boosts, and fund submissions; Artizen sign-in is shown as coming soon
- **Community Rewards** — 100 ART for verifying an Artizen wallet on Base and joining the map, plus weekly ART for community IPFS pinners, both queued to the payroll

## How to use everything (quick guide)

A hands-on tour of what's here. Each item links to the detailed section below.

### Visiting the canopy

1. Open https://thejollylama.github.io/DecentCanopy/. The Artizen canopy loads by default; the **🧭 Tour** opens on a first visit and can be replayed from the toolbar.
2. **Explore:** scroll to zoom and drag to pan. Click any blip to open its card. Use **View** to switch between all entities, projects, funds, or creators, and search for anything by name. Selecting a fund opens its own fund canopy; use the return control to come back.
3. **Make it your view (optional):** in the tour, pick your creator card or add a local one. The canopy then opens on you. This is a browser-local preference; clear it from **Participate / import**.
4. **ⓘ Data notes:** the tab on the right edge holds snapshot dates, counts, and limits. Click to stash it.
5. **Canopy switch:** choose **Green Tea canopy** (or `/?canopy=green-tea`) for The Green Tea Party cluster.
6. **Globe view:** see creators, projects, and funds that opted in to a location. Drag to turn and select a marker to open its card.
7. **About** (click the header title): project context, the Artizen link, contributor info, and community rewards.

See [Features](#features) and [Artizen Canopy](#artizen-canopy).

### As a creator

- **See your card:** search your name and open your creator blip. The **Artizen account** section shows your login status (sign-in is *coming soon*; we will never ask for your Artizen password), whether your wallet is known to DecentCanopy, and your Artizen space: projects, supported projects, boosts, fund submissions, and locations.
- **Fill in your card publicly:** open a pull request on `data/artizen-curation.json` with your creator record, projects, `links` (website, Discord, GitHub), `publicStats`, and `artizenProfile`. TheJollyLaMa's card is the worked example. See [A filled-in creator canopy](#a-filled-in-creator-canopy-thejollylama).
- **Join the map and earn 100 ART:** connect your wallet in the header and click **🎁 Claim 100 ART** (or use About → Claim 100 ART, or the link on your card). Fill in the GitHub issue form with your Artizen wallet, projects, website, and optional globe location. A bot checks Base for ART that Artizen minted to that wallet; if it passes, your blip goes on the map and 100 ART is queued to that wallet. See [Community Rewards](#community-rewards).
- **Local-only edits:** on any card, **Edit website / wallet / location** saves drafts in your browser only. **Participate / import** previews a participation JSON (website cards, season funding, boosts, purchases) and powers **Replay imported activity**. Nothing local is uploaded. See [Opt-in participation prototype](#opt-in-participation-prototype).
- **Public wallet utility:** a linked wallet shows explorer links on Ethereum, Optimism, or Base and can read its public native balance on request. A wallet link is not proof of identity or wealth.

### Pinning the canopy data (earn weekly ART)

1. Open the **IPFS** popover in the header and click **📌 Pin it yourself**. Copy the CID, then either run the shown `ipfs pin add` command on your own node, or paste your own Pinata JWT to pin by CID. The JWT is used once in that tab and never saved or sent anywhere except Pinata.
2. File a **Pinner request** from About → Become a pinner, with your wallet and public gateway URL.
3. After the owner approves you, a weekly check fetches the dataset from your gateway and queues 25 ART when it matches. See [Weekly ART for community pinners](#-weekly-art-for-community-pinners).

### Contributing code and ideas

1. About → **File an Issue** to join the contributor whitelist (GitHub username + wallet).
2. Pitch ideas or pick up issues labeled `bounty: <amount> ART|USDC`. Idea authors share 20% via `idea-credit: @username`. Testing issues use `test-bounty:` with `/test-complete`.
3. Merged pull requests queue payouts automatically in `payroll-queue.json`. See [Contributor Payroll](#contributor-payroll).

### Admin (repository owner) playbook

- **Payroll button:** the **💸 Payroll** toolbar button appears only while the registered owner wallet (`role: "owner"` in `contributor-accounts.json`, currently TheJollyLaMa) is connected in the header. Connect it, open Payroll, review each entry, and pay on Base. Then run the **Settle Payroll** workflow with the confirmed transaction hash (roles: contributor, implementer, idea-originator, tester, airdrop, pinner). Hiding the button is a convenience; the router's `PAYROLL_ROLE` and owner-wallet checks are the real authorization.
- **Airdrop claims:** the bot labels each claim `airdrop-queued` or `airdrop-needs-review`. Comment `/airdrop-approved` to approve an edge case manually; the claimant can comment `/airdrop-recheck` after funding a project.
- **Pinner requests:** comment `/pinner-approved` on a request to add the pinner. The **Community Pinning Rewards** workflow runs every Monday (or on demand) and opens a `pinning-check` issue with the results.
- **IPFS backup:** **Pin Canopy Data to IPFS** runs on data pushes and daily. It needs the `PINATA_JWT` Actions secret, which is never committed or exposed to the browser.
- **Refresh Artizen data:** `node scripts/sync-artizen-data.js`, review the diff, and commit.
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
├── artizen-account.js            Creator-card Artizen account preview (sign-in coming soon)
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
| Artizen canopy (default) | `/` or `/?canopy=artizen` | Artizen project/fund graph snapshot in `data/artizen.json`, plus separately attributed local curation |
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

The default landing view and `/?canopy=artizen` explore a refreshable snapshot of the public Artizen graph:

- Artizen project and fund records appear as distinct node types.
- The public index's `submitted`, `curated`, and `funded` project-to-fund relationships are rendered as connections, with season metadata retained where present.
- Search covers names, descriptions, tags, and facets. The **View** filter switches between all entities, projects, funds, or creators and their connected project neighborhood.
- The seed **TheJollyLaMa** creator node and its stated project associations are maintained separately in `data/artizen-curation.json`, with the provided rationale shown on each curated edge. qArt-code is included as a curated entry while it is absent from the checked-in index; the adapter will use the official Artizen record automatically if a later snapshot contains its slug.
- The side panel labels the source of each relationship. Curated links are dashed and gold; Artizen-index links remain separate.
- Selecting any fund opens a focused fund canopy: projects directly linked to that fund, plus their direct links to other projects, funds, and creator nodes. The summary distinguishes direct Artizen project–fund records from locally curated links, and the return control restores the complete Artizen view.

The Artizen matching index used for this snapshot does not include creator fields, project fundraising totals, artifact-purchase records, or proof of public-ledger transactions. Individual Artizen project pages may provide creator bylines, but the importer does not crawl thousands of detail pages; creator links are therefore limited to the local curation file for now. This view does not infer or display missing data as fact. In particular, an Artizen `funded` relationship is shown as a source relationship record, not as a verified on-chain transaction.

The browser reads the checked-in `data/artizen.json` snapshot rather than requesting Artizen from the user's browser; this avoids relying on cross-origin browser access and makes each snapshot reproducible. Refresh it with Node.js 18 or newer:

```sh
node scripts/sync-artizen-data.js
```

The command validates the public feed before replacing the snapshot and reports its source generation date. Review the generated snapshot before publishing an update. Curated records and links are not overwritten by the sync.

Choose **Green Tea canopy** in the canopy switch (or open `/?canopy=green-tea`) to focus on The Green Tea Party and directly associated projects such as DecentCanopy, Green Tea Party Kiln, and Green Tea Hut #1. This focused view uses the same Artizen snapshot and only includes locally curated `associated-project` links for this cluster.

### Opt-in participation prototype

**Participate / import** accepts a previewed, versioned JSON file with explicit consent to browser-local storage. Nothing is uploaded, published to IPFS, or sent to Artizen. Wallet connection is optional and does **not** authenticate an Artizen account or prove ownership. Artizen credentials and session cookies must never be entered or imported. Website editing on data cards is a local annotation, not an authorized owner update. Direct HTTPS links are required; misleading links and concealed destinations are not appropriate.

The prototype does not use ZenBoost or automate boosting. Artizen's [playbook](https://play.artizen.fund/#--terms-conditions---house-vibes) requires manual boosts and prohibits manipulation. Future live imports, account linking, and shared owner editing require an approved integration, identity verification, consent controls, and persistent server storage.

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

#### Creator Artizen account (coming soon)

Every creator card includes an **Artizen account** section:

- **Login status** — always “Not signed in to Artizen” today. The sign-in form (Artizen profile URL, wallet address) is shown grayed out and disabled with a **Coming soon** note. It will only be enabled through an Artizen-approved sign-in; DecentCanopy never asks for Artizen passwords or session cookies.
- **Wallet known to DecentCanopy** — whether a public wallet has been linked to this creator, and whether the wallet connected in the header matches it (case-insensitive, with network noted). A match is a hint, not verified ownership. The card refreshes when the header wallet changes.
- **Artizen space preview** — projects from curated/participant links (plus projects that grew from them via `associated-project`), funds those projects were submitted to, curated in, or funded by in the public graph, participant-reported fund membership, and participant-reported stewardship (`fund-steward`). The public feed has no steward or purchase data, so **artifact collections** are marked Coming soon.
- **Locations** — the creator's own opt-in location is listed separately from each project's and fund's location. Creators often live somewhere other than their projects or funds; nothing is inferred between them.

#### A filled-in creator canopy: TheJollyLaMa

`data/artizen-curation.json` shows what a fully connected creator card looks like. Every field is public and labeled with its source:

- **Profile picture** — `creator.image` (TheJollyLaMa's Artizen creator avatar, the public image shown beside their posts and profile on Artizen), labeled by `imageSource`. Project and fund cards show their artwork from the Artizen public index; clicking the artwork opens the real Artizen page (`artizen.fund/index/p/<slug>` for projects, `artizen.fund/index/mf/<slug>` for funds, or a curated `artizenPageUrl`). Add `creator.artizenPageUrl` to make the avatar open the creator's Artizen profile.
- **Projects** — Decent Jukebox (now [DecentBusking](https://thejollylama.github.io/DecentBusking/)), BigNuten, qArt-code, The Green Tea Party, Green Tea Hut #1, DeCent Canopy, and ArtFi. Each has its website, its GitHub repo, its Artizen project page, and the [A Decent Agency Discord](https://discord.gg/tkBfwT3YMN), where every project has a channel.
- **Projects you support** — Green Tea Party Kiln is **Mama's project**. It sits in The Green Tea Party envelope; TheJollyLaMa supports it with creator-declared `boosted` and `collected-artifacts` edges. It never counts as TheJollyLaMa's project or toward their total. Related projects (one hop of `associated-project`) are not pulled into a creator's own project list.
- **`publicStats`** — the "Total", boosts, boost bonus, and season-7 fund submissions read from each public Artizen project page. They're dated (`capturedAt`) and are not live. Project halos use these totals for brightness when no participant-reported funding exists.
- **`artizenProfile`** — the PRO badge, bio, boost points, ART tokens, recent boosts, and `stewardship: []` (shown as **None**), all read from the public creator profile.
- **No fund memberships** — every fund submission is still pending review, so none is shown as membership (`fundMembershipNote`). The account panel lists **Fund submissions** (submitted, curated, or funded records from the public graph) and says plainly that a submission is not membership. Season submissions on project cards are marked "pending review" (`publicStats.submissionStatus`).
- **`boosted` edges** — a recent boost whose project is in the index (Marsita the Ultra), plus the Kiln. Other recent boosts are listed by name only.
- **Artifact collection** lists creator-declared `collected-artifacts` edges (unverified). The full, verified list stays **Coming soon** until sign-in or ledger receipts exist.

To fill in your own card the same way, add your creator, projects, `links`, `publicStats`, and `artizenProfile` fields to a pull request on `data/artizen-curation.json`. Use only public data you are comfortable publishing, and include capture dates.

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

Two community programs pay ART through the same payroll queue as bounties. Settings are in [`community-rewards.json`](community-rewards.json). Every reward is queued by a GitHub Action and is paid only when the owner settles the payroll from the **Payroll** panel.

### 🎁 100 ART for putting your blip on the map

1. Connect a wallet in the header (optional) and click **🎁 Put your blip on the map**. You can also use **About → Claim 100 ART** or the claim box in any creator card's Artizen account panel. Each opens the [`airdrop-claim.yml`](.github/ISSUE_TEMPLATE/airdrop-claim.yml) issue form, pre-filled where possible.
2. Enter your **Artizen wallet** (the Base smart wallet shown in Artizen's wallet panel), your creator name, your Artizen project links, and an optional website. You can also share an optional globe location, rounded to country or about city level. Then tick the publishing consent box.
3. The **Airdrop Claim** workflow ([`processAirdropClaim.js`](scripts/processAirdropClaim.js)) checks the wallet on Base with keyless public APIs: a Blockscout log query and a public RPC.
   - **Verified** means Artizen's ART token (the JBERC20 of Artizen's Juicebox project #6) minted at least `minArtMinted` (500) ART to that wallet from the zero address. This happens when you fund a project on Artizen.
   - Holding ART, or paying the shared Juicebox terminal for another project, does not count.
4. If verified, the bot:
   - publishes your record in [`data/community-creators.json`](data/community-creators.json)
   - queues **100 ART** for that same Artizen wallet (role `airdrop`)
   - labels the issue `airdrop-queued`, comments, and closes it

   If not verified, it labels the issue `airdrop-needs-review` and explains what to check. The claimant can comment `/airdrop-recheck` after funding a project. The owner can approve manually with `/airdrop-approved`, which records `method: owner-approved`.

Your blip appears as a green **community-verified** creator node, linked to the projects you listed (labeled *self-declared*) and with the ✅ verification on its card. If the claim comes from the GitHub account of an already-curated creator (for example `curator:thejollylama`), the verification merges into that node.

Rules and caveats:
- One claim per GitHub account, per Artizen wallet, and per connected wallet. The payroll validator also rejects an Artizen wallet that appears in more than one claim.
- The airdrop is always paid to the **verified Artizen wallet**, never to a different address. Someone who pastes another person's Artizen wallet only pays that person, and it uses up that wallet's claim.
- Verification proves that the wallet funded Artizen on-chain. It does **not** prove who controls the wallet, and it is not an Artizen login.
- No Artizen credentials, cookies, or scraping are involved.

### 📌 Weekly ART for community pinners

Anyone can help keep the dataset decentralized:

- **Pin it yourself:** open the header **IPFS** badge → **📌 Pin it yourself**. Copy the `ipfs pin add <cid>` command for your own Kubo node, or pin by CID with your Pinata account. The Pinata JWT is used once in that tab, sent only to `api.pinata.cloud`, and never stored. A scoped, revocable key is best.
- **Earn ART:** serve your pin from **your own** gateway, then file the [`pinner-request.yml`](.github/ISSUE_TEMPLATE/pinner-request.yml) form with your Base reward wallet and gateway URL. Never paste API keys there.
  - The **Pinner Request** workflow checks your gateway right away and on `/pinner-recheck`.
  - The owner approves you with `/pinner-approved`, which adds you to [`data/community-pinners.json`](data/community-pinners.json).
- **Weekly check:** **Community Pinning Rewards** runs every Monday, and you can also dispatch it manually.
  - It fetches `<gateway>/ipfs/<cid>` for the current backup CID, or any `recentCids` entry from the last 8 days.
  - A pass requires the bytes to hash to the manifest's `payloadSha256`.
  - Passing pinners get **25 ART** queued (role `pinner`, up to 20 per week, earliest approvals first).
  - The results go in a public `pinning-check` issue, and the check runs at most once per ISO week.
  - The IPFS popover shows how many community nodes passed this week.

A gateway check shows that the data is **available** through that gateway. It is not proof of storage. Please serve only content you have pinned, for example with a Pinata dedicated gateway or Kubo with `Gateway.NoFetch = true`. Randomized storage proofs, like ArtFi's spot-checked node registry, are a natural upgrade path.

### Setup checklist (maintainer)

- Add the `PINATA_JWT` Actions secret, then run **Pin Canopy Data to IPFS** once. Pinning rewards need a published CID.
- Create the labels `airdrop-claim`, `airdrop-queued`, `airdrop-needs-review`, `pinner-request`, and `pinning-check`. Issue forms only apply labels that already exist.
- Keep the shared router's `decentcanopy-repo-dev` fund stocked with ART for airdrop and pinner payouts. Settle them with the **Settle Payroll** workflow using role `airdrop` or `pinner`.

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

Merged pull requests can queue rewards from linked issues labeled `bounty: <amount> ART` and/or `bounty: <amount> USDC`. A single issue can have one label per configured token; duplicate labels for the same token are rejected. Optional `idea-credit: @username` splits each bounty 80/20, with amounts that cannot be represented at that token's ledger precision rejected rather than rounded. Testing issues support the same configured assets with `test-bounty: <amount> <currency>`, `/test-complete`, and owner-only `/test-approved` commands.

Only registered wallets can receive entries: bounty, idea, and testing roles use `contributor-accounts.json`; `airdrop` entries must pay the verified Artizen wallet recorded for that claim in `data/community-creators.json`; and `pinner` entries must pay an approved wallet in `data/community-pinners.json`. GitHub Actions add entries to `payroll-queue.json` and accrue per-token account totals. Token addresses, decimals, the shared Base router, and the configured `decentcanopy-repo-dev` fund slug are in `payroll-assets.json`.

Connect the registered repository-owner wallet in the header; the **💸 Payroll** toolbar button only appears for that wallet. (This only hides the button; the router role and owner checks below are the real authorization.) The panel checks Base, the router's `PAYROLL_ROLE`, fund status/balance, token approval, contributor identity, and on-chain work-reference replay protection before offering a payout. If a recipient has not yet been approved on the shared router, the panel can add them only when the connected wallet also has `CONTRIBUTOR_ADMIN_ROLE`; it never revokes or changes other repositories' contributor approvals.

The `decentcanopy-repo-dev` fund must be created, active, and funded on the existing shared router before payouts can succeed; supported assets must also be router-approved. The repository configuration does not deploy a router or create/fund this allocation. After the panel confirms a `payout()` transaction on Base, run the owner-only **Settle Payroll** GitHub Actions workflow with the exact contributor, issue, role, currency, and confirmed transaction hash. That workflow moves only the matching entry to settled and commits the ledger update to `main`; it does not send the payment itself. Do not run it before the on-chain transaction is confirmed.

The header's animated canopy motif uses a three-tree grove, varied stationary trees lining its curved pathways, and wandering forest critters. The pathway trees follow the actual trail geometry at every header width. Critters move between tree canopies with species-specific hops, trots, fluttering flight, and resting pauses; routes adapt to resizing and stop for reduced-motion preferences. Its title opens an About dialog with project context and the official DecentCanopy Artizen page.

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
- **Data views have separate source scope.** The default prototype uses public Artizen season records in `data/*.json`; `/?canopy=artizen` uses the project/fund graph in `data/artizen.json` and separately attributed local curation in `data/artizen-curation.json`.

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