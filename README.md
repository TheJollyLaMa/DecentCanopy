# DecentCanopy

A new perspective on coverage and associations.

**DecentCanopy** is a fractal constellation visualization and data layer for mapping multi-project stewardship, coordination, and public ledger associations across decentralized networks.

## Overview

DecentCanopy provides:

- **Fractal Constellation View** — A Mandelbrot-inspired interactive spiral map displaying projects as nodes with dynamic zoom and pan controls
- **Association Mapping** — Visual representation of project relationships via public ledgers and stewardship links
- **Sidepanel Details** — Project information, parent/child relationships, and cross-project associations
- **Shared Data Layer** — Normalized access to projects, associations, activity, and metrics via `scripts/data-layer.js`
- **Mock Adapter** — Local JSON fixtures for deterministic prototype rendering

## Architecture

```
views/
├── index.html              Main constellation view
├── styles/spiral.css       Styling for canvas & UI
scripts/
├── spiral.js              Canvas rendering & interaction logic
├── data-layer.js          Shared data access module
├── data-adapter/
│   ├── interface.js       Adapter contract definition
│   └── mock-adapter.js    Local JSON data source
data/
├── projects.json          Project records (id, name, track, status, raised, goal)
├── associations.json      Relationship edges (source, target, type)
└── activity.json          Public ledger activity feed (optional)
```

## Data Schema

### Projects (`data/projects.json`)

Each project record requires:

```json
{
  "id": "proj-001",
  "name": "Project Name",
  "track": "Green Tea",
  "status": "active",
  "raised": 7800,
  "goal": 12000,
  "stewards": 8,
  "description": "...",
  "location": "Portland, OR"
}
```

**Required fields:** `id`, `name`, `track`, `status`, `raised`, `goal`  
**Optional fields:** `lastUpdate`, `publicUpdate`, `stewards`, `description`, `repoUrl`, `artizenUrl`, `nextAction`, `location`

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

Public ledger entries for the activity feed:

```json
{
  "type": "mission-complete",
  "title": "Project milestone reached",
  "date": "2026-07-30",
  "projectId": "proj-001",
  "amount": null
}
```

**Required fields:** `type`, `title`, `date`  
**Optional fields:** `projectId`, `amount`

## Development

This repository intentionally favors minimal dependencies.

**Run locally:**

```sh
# Option 1 — open directly in a browser (some fetch() calls may not work)
open index.html

# Option 2 — use a simple static server (recommended)
npx serve .
```

Then visit `http://localhost:3000` (or the port shown by `serve`).

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

- Filter by track (e.g., "Green Tea", "Blue Tea", "Red Rice")
- Filter by status (e.g., "active", "planning", "completed", "paused")
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
GTPData.filterState  // { track, status, search }
GTPData.setFilter(key, value)
GTPData.onFilterChange(callback)
```

## Core Principle

> If a feature increases engagement but decreases agency, don't build it.
> If a feature decreases engagement but increases agency, seriously consider building it.

DecentCanopy prioritizes stewardship visibility and cross-project coordination over engagement metrics.

## Next Steps

- Contract adapter for reading project registry and treasury data on-chain
- Multi-network support (Ethereum, Optimism, Base, others)
- Live data integration from public ledgers
- Cross-repository project discovery
- Quadratic funding and governance primitives

## License

GNU General Public License v3.0