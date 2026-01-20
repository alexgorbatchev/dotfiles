# 6. Core Feature Modules

[← Back to Index](00-index.md) | [Previous: Information Architecture](05-information-architecture.md) | [Next: Event System →](07-event-system.md)

---

## Table of Contents

- [6.1 Dashboard Overview](#61-dashboard-overview)
- [6.2 Tool Catalog](#62-tool-catalog)
- [6.3 Tool Detail View](#63-tool-detail-view)
- [6.4 Dependency Graph](#64-dependency-graph)
- [6.5 Real-Time Installation Monitor](#65-real-time-installation-monitor)
- [6.6 File Operations Explorer](#66-file-operations-explorer)
- [6.7 Shell Integration Viewer](#67-shell-integration-viewer)
- [6.8 Update Center](#68-update-center)
- [6.9 System Health Dashboard](#69-system-health-dashboard)
- [6.10 Global Search & Command Palette](#610-global-search--command-palette)

---

## 6.1 Dashboard Overview

The central command center providing at-a-glance system health and quick actions.

**Data Sources:**

- `IToolInstallationRegistry.getAllToolInstallations()`
- `IFileRegistry.getStats()`
- `UpdateChecker.checkForUpdates()` (batched)

**Layout:**

```
DASHBOARD
════════════════════════════════════════════════════════════════════════════════

STATS ROW
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│    47        │ │     3        │ │    12        │ │   2.4 GB     │ │    847       │
│   Tools      │ │   Updates    │ │   Pending    │ │    Disk      │ │   Files      │
│  Installed   │ │  Available   │ │   Install    │ │   Usage      │ │  Tracked     │
│    ↑5        │ │              │ │              │ │   ↑0.2GB     │ │   ↑23        │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘

QUICK ACTIONS
[ Install All ]  [ Check Updates ]  [ Generate All ]  [ Health Check ]  [ Export ]

SPLIT VIEW
┌─────────────────────────────────────────┐  ┌─────────────────────────────────┐
│         RECENT ACTIVITY                 │  │        HEALTH STATUS            │
│                                         │  │                                 │
│  ● 14:35  fzf installed (v0.55.0)      │  │  ✓ All 47 binaries OK          │
│  ● 14:32  ripgrep updated              │  │  ✓ All symlinks valid          │
│    v14.0.0 → v14.1.0                   │  │  ⚠ 2 stale shims found         │
│  ● 14:28  bat shim regenerated         │  │  ✓ Registry healthy            │
│  ● 14:15  starship hook executed       │  │  ✓ No conflicts detected       │
│  ● 13:45  generate completed           │  │                                 │
│           (42 tools processed)         │  │  Last check: 2 minutes ago     │
│                                         │  │  [Run Full Check]              │
│  [View Full Log →]                     │  │                                 │
└─────────────────────────────────────────┘  └─────────────────────────────────┘

TOOLS BY INSTALLATION METHOD
┌────────────────────────────────────────────────────────────────────────────────┐
│ github-release  ████████████████████████████████████░░░░░░░  28 (60%)         │
│ brew            ██████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  12 (26%)         │
│ cargo           █████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   4 (9%)          │
│ curl-tar        ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   2 (4%)          │
│ manual          █░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   1 (2%)          │
└────────────────────────────────────────────────────────────────────────────────┘
```

**Features:**

- Real-time stat counters with trend indicators (↑↓)
- Activity feed with infinite scroll and relative timestamps
- Health status with drill-down to specific issues
- Distribution chart for installation methods
- Quick action buttons triggering CLI commands
- Sparkline graphs in stat cards (optional)

---

## 6.2 Tool Catalog

Comprehensive list of all tools with filtering, sorting, and bulk operations.

**Layout:**

```
TOOLS                                                           47 tools total
════════════════════════════════════════════════════════════════════════════════

TOOLBAR
┌────────────────────────────────────────────────────────────────────────────────┐
│  🔍 [Search tools...]          [Method ▼] [Status ▼] [Sort ▼] [View: Grid|List] │
│                                                                                │
│  Tags: #cli  #rust  #go  #node  #shell  #git  #editor  #search                │
└────────────────────────────────────────────────────────────────────────────────┘

TOOL GRID (responsive)
┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐
│      🔍 fzf       │  │      🦇 bat       │  │     🔎 ripgrep    │
│   ────────────    │  │   ────────────    │  │   ────────────    │
│   v0.55.0    ✓    │  │   v0.24.0    ⬆    │  │   v14.1.0    ✓    │
│   github-release  │  │   github-release  │  │   cargo           │
│                   │  │   → v0.25.0       │  │                   │
│ [Details] [···]   │  │ [Update]  [···]   │  │ [Details] [···]   │
└───────────────────┘  └───────────────────┘  └───────────────────┘

BATCH ACTIONS (when tools selected)
☑ Select All   |   Selected: 3 tools   →   [ Update ]  [ Reinstall ]  [ Remove ]
```

**Tool Card States:**

| State            | Visual                    | Actions                            |
| ---------------- | ------------------------- | ---------------------------------- |
| Not Installed    | Gray, dashed border       | Install                            |
| Installing       | Pulse animation, progress | Cancel                             |
| Installed        | Solid, green ✓            | Update, Reinstall, Remove, Details |
| Update Available | Amber ⬆, version shown    | Update, Dismiss                    |
| Stale/Outdated   | Orange ⚠                  | Fix, Update                        |
| Failed           | Red ✗                     | Retry, View Error                  |
| Disabled         | Muted, strikethrough      | Enable                             |

**Filtering:**

- By installation method (github, brew, cargo, curl, manual)
- By status (installed, pending, outdated, disabled, error)
- By platform support
- By tags/categories
- Full-text search

---

## 6.3 Tool Detail View

Deep dive into a single tool's configuration, files, and history.

**Layout:**

```
← Back to Catalog

TOOL DETAIL: fzf
════════════════════════════════════════════════════════════════════════════════

HEADER
┌────────────────────────────────────────────────────────────────────────────────┐
│  🔍 FZF                                               [Reinstall] [Update]     │
│  A command-line fuzzy finder                          [Remove]    [Config]     │
│                                                                                │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐                      │
│  │   v0.55.0     │  │    github     │  │   Jan 15      │                      │
│  │   Version     │  │    Method     │  │   Installed   │                      │
│  └───────────────┘  └───────────────┘  └───────────────┘                      │
└────────────────────────────────────────────────────────────────────────────────┘

TABS: [ Overview | Shell | Hooks | Files | History ]
```

**Tab Contents:**

### Overview Tab

- Installation details (repository, asset, URL, path)
- Binaries with shim status
- Dependencies

### Shell Tab

- Environment variables
- Aliases
- Functions
- Completions
- Init script

### Hooks Tab

- Configured hooks (before-install, after-download, after-extract, after-install)
- Last execution details

### Files Tab

- File tree with ownership
- File types and sizes
- Status indicators

### History Tab

- Installation timeline
- Version changes
- Duration and asset info

---

## 6.4 Dependency Graph

Interactive visualization of tool dependencies and provider relationships.

**Layout:**

```
DEPENDENCY GRAPH
════════════════════════════════════════════════════════════════════════════════

CONTROLS
[Layout: Force ▼]  [Show: All ▼]  [Highlight: None ▼]  [Zoom: 100%]  [Export ▼]

┌────────────────────────────────────────────────────────────────────────────────┐
│                              GRAPH CANVAS                                      │
│                                                                                │
│                         ┌────────┐                                             │
│                         │  rust  │                                             │
│                         └───┬────┘                                             │
│                             │                                                  │
│                    ┌────────┴─────────┐                                        │
│                    ↓                  ↓                                        │
│                ┌──────┐          ┌──────┐                                      │
│                │cargo │          │rustup│                                      │
│                └──┬───┘          └──────┘                                      │
│                   │                                                            │
│          ┌────────┼────────┐                                                   │
│          ↓        ↓        ↓                                                   │
│      ┌──────┐ ┌──────┐ ┌──────┐                                               │
│      │ eza  │ │ripgrep│ │  fd  │                                               │
│      └──────┘ └──────┘ └──────┘                                               │
│                                                                                │
│  LEGEND                                                                        │
│  ○ Installed   ◐ Pending   ◯ Not installed   ● Provider   ⬡ System binary    │
│  ─▶ depends on   ═▶ provides binary   ─ ─▶ optional                           │
└────────────────────────────────────────────────────────────────────────────────┘

VALIDATION
✓ No circular dependencies detected
✓ All dependencies can be satisfied
⚠ 2 tools have ambiguous providers (click to resolve)
```

**Visual Encoding:**

| Element             | Shape/Style                | Meaning                   |
| ------------------- | -------------------------- | ------------------------- |
| Installed tool      | Solid circle, green border | Healthy installation      |
| Pending tool        | Dashed circle, yellow      | Configured, not installed |
| Failed tool         | Solid circle, red          | Installation failed       |
| System binary       | Diamond, gray              | External dependency       |
| Direct dependency   | Solid arrow                | Required                  |
| Optional dependency | Dashed arrow               | Optional                  |
| Circular dependency | Red dashed line            | Invalid (warning)         |

---

## 6.5 Real-Time Installation Monitor

Live visualization of installation progress with detailed phase tracking.

**Layout:**

```
LIVE INSTALLATION                                                    🔴 Recording
════════════════════════════════════════════════════════════════════════════════

CURRENT OPERATION
┌────────────────────────────────────────────────────────────────────────────────┐
│  Installing: ripgrep                                                           │
│  Method: cargo                                                                 │
│  Started: 14:32:15 (2m 34s elapsed)                                           │
│                                                                                │
│  PROGRESS                                                                      │
│  ████████████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  65%         │
│  Building ripgrep... (187/321 crates)                                         │
└────────────────────────────────────────────────────────────────────────────────┘

PHASE PIPELINE
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│ before  │───▶│download │───▶│ after   │───▶│ build/  │───▶│ after   │
│ install │    │         │    │download │    │ extract │    │ install │
│   ✓     │    │   ✓     │    │   ✓     │    │   ●     │    │   ○     │
│ 0.12s   │    │  1.8s   │    │ 0.05s   │    │ running │    │ pending │
└─────────┘    └─────────┘    └─────────┘    └─────────┘    └─────────┘

LIVE LOG
┌────────────────────────────────────────────────────────────────────────────────┐
│  14:32:15.123  INFO   [ripgrep] Starting installation                         │
│  14:32:15.234  INFO   [ripgrep] Using cargo installer                         │
│  14:34:12.901  DEBUG  [ripgrep] | Compiling regex v1.10.2  ◀──────────────── │
│  ▊ (auto-scroll enabled)                                                      │
└────────────────────────────────────────────────────────────────────────────────┘

QUEUE (2 pending)
│  1. bat (github-release) - waiting                                 [Cancel]   │
│  2. fd (cargo) - waiting                                          [Cancel]   │

RECENTLY COMPLETED
│  ✓ fzf - Success (4.2s)                                          [Details]   │
│  ✗ exa - Failed: Binary not found in archive                     [Retry]     │
```

**Installation Phases:**

| Phase              | Description                         |
| ------------------ | ----------------------------------- |
| **validate**       | Configuration and dependency checks |
| **before-install** | Pre-installation hook               |
| **download**       | Asset/package download              |
| **after-download** | Post-download hook                  |
| **extract**        | Archive extraction                  |
| **after-extract**  | Post-extraction hook                |
| **setup**          | Binary setup, shim generation       |
| **after-install**  | Post-installation hook              |
| **complete**       | Final status                        |

---

## 6.6 File Operations Explorer

Visual timeline and explorer for all file system operations.

**Views:**

### Timeline View

- Chronological list grouped by date
- Tool attribution
- Operation type (writeFile, chmod, symlink, mkdir)
- File path and metadata

### Tree View

- Hierarchical file system view
- File type icons
- Symlink visualization (→)
- Color coding by tool ownership

### Table View

- Sortable columns
- Advanced filtering
- Export to CSV/JSON

**Features:**

- Filter by tool, type, operation, time range
- Operation grouping by operation_id
- File content preview (for text files)
- "Show related" to see all operations in same group
- Orphan detection (files without owner)
- Disk usage aggregation

---

## 6.7 Shell Integration Viewer

Visual representation of shell configurations generated for each tool.

**Sections:**

- **Status:** Init script path, profile integration, completions directory
- **Contributions by Tool:** Matrix showing ENV/ALIAS/FUNC/COMP per tool
- **Environment Variables:** Full list with source attribution
- **Aliases:** All aliases with commands and source
- **Functions:** Shell functions with descriptions
- **Completions:** Status per tool
- **Potential Conflicts:** Warnings about shadowing
- **Startup Impact:** Estimated shell startup time contribution
- **Generated Script Preview:** Syntax-highlighted init script

---

## 6.8 Update Center

Centralized management of available updates with batch operations.

**Features:**

- Summary stats (available, up-to-date, pinned, unknown)
- Expandable changelog preview
- Version pinning/unpinning
- Batch update selection
- Update history

---

## 6.9 System Health Dashboard

Comprehensive health checks and validation results.

**Health Check Categories:**

| Check              | Description                                     | Fix Action               |
| ------------------ | ----------------------------------------------- | ------------------------ |
| **Binaries**       | All installed binaries exist and are executable | Reinstall affected tools |
| **Shims**          | All shims point to valid targets                | Regenerate shims         |
| **Symlinks**       | All config symlinks are valid                   | Recreate symlinks        |
| **Registry**       | Database integrity and consistency              | Compact/repair registry  |
| **Configurations** | All tool configs pass validation                | Show validation errors   |
| **Dependencies**   | No missing or circular deps                     | Show dependency issues   |
| **Permissions**    | Correct file permissions                        | Fix permissions          |
| **Conflicts**      | No path conflicts                               | Resolve conflicts        |
| **Disk Space**     | Sufficient space available                      | Show cleanup options     |

---

## 6.10 Global Search & Command Palette

**Activation:** `⌘K` (macOS) / `Ctrl+K` (Windows/Linux)

**Features:**

- Fuzzy search across all entities (tools, files, operations, commands)
- Category-grouped results
- Keyboard navigation (↑↓, Enter, Esc)
- Recent searches history
- Quick actions with keyboard shortcuts

**Keyboard Shortcuts:**

| Shortcut | Action               |
| -------- | -------------------- |
| `⌘K`     | Open command palette |
| `⌘I`     | Install tool         |
| `⌘U`     | Check updates        |
| `⌘G`     | Generate all         |
| `⌘H`     | Health check         |
| `1-9`    | Navigate to section  |
| `/`      | Focus search         |
| `Esc`    | Close modal/panel    |

---

[← Back to Index](00-index.md) | [Previous: Information Architecture](05-information-architecture.md) | [Next: Event System →](07-event-system.md)
