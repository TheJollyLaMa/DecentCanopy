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

## Architecture

```
DecentCanopy/
├── index.html                    Main constellation view (app entrypoint)
├── .env.example                  Environment variable template
styles/
└── spiral.css                    Canvas, toolbar, sidepanel & legend styling
scripts/
├── config.js                     Chain IDs, supported networks, contract address slots
├── mode-router.js                Resolves prototype vs app mode from URL
├── network.js                    Chain ID parsing & supported-chain helpers
├── contract-adapter.js           Public contract ABIs + read/write placeholder calls
├── data-layer.js                 Shared data access module (GTPData)
├── data-adapter/
│   ├── interface.js              Adapter method contract & validation
│   ├── mock-adapter.js           Local Artizen JSON loader (prototype mode)
│   └── app-adapter.js            On-chain data adapter (app mode, wires contract-adapter)
├── spiral.js                     Canvas fractal map — rendering, pan/zoom, interaction
├── data/
│   ├── projects.json             Artizen project records (season, phase, outcome, funding totals, …)
│   ├── associations.json         Relationship edges (source, target, type)
│   └── activity.json             Public season/funding activity feed
```

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
       data-layer.js    → GTPData  (loads + normalises data via active adapter)
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
| Prototype (default) | `/` | Local Artizen season snapshot in `data/*.json` |
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

### Filtering

- Filter by season track (e.g., "Season 1 · Founding", "Season 2 · Public Goods")
- Filter by status/phase (e.g., "curation", "competition", "funded", "archived")
- Search by project name or description

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
GTPData.getFilterOptions()  // Available tracks, statuses, locations
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

Merged pull requests can queue ART bounties from linked issues labeled `bounty: <amount> ART`. An optional `idea-credit: @username` label splits the bounty 80% to the implementer and 20% to the idea originator. Testing issues use `test-bounty: <amount> ART`, `/test-complete`, and owner-only `/test-approved` commands.

Only wallets in `contributor-accounts.json` can receive entries. GitHub Actions update `payroll-queue.json`; an administrator then verifies payment and runs the **Settle Payroll** workflow. Settlement records ledger state and an optional transaction hash but does not transfer ART on-chain.

Validate locally with:

```sh
node --test test/payroll.test.js test/commentArt.test.js
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
- **Source data is from public Artizen season records.** The `data/*.json` files now model the seasons, phases, funding outcomes, and project relationships from Artizen’s public funding story rather than the older Green Tea Party fixture set.

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