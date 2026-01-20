# 5. Information Architecture

[← Back to Index](00-index.md) | [Previous: Objectives & Metrics](04-objectives-metrics.md) | [Next: Core Features →](06-core-features.md)

---

## 5.1 Primary Navigation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🏠 Dashboard    📦 Tools    📁 Files    🔄 Updates    🐚 Shell    ⚙️ Settings │
└─────────────────────────────────────────────────────────────────────────────┘
```

| Section       | Purpose                         | Key Views                              |
| ------------- | ------------------------------- | -------------------------------------- |
| **Dashboard** | At-a-glance health and activity | Stats, activity feed, quick actions    |
| **Tools**     | Tool management and exploration | Catalog, dependency graph, detail view |
| **Files**     | File operations and ownership   | Explorer, timeline, registry query     |
| **Updates**   | Version management              | Available updates, history, batch ops  |
| **Shell**     | Shell integration visualization | Init scripts, aliases, completions     |
| **Settings**  | Configuration management        | Paths, features, diagnostics           |

## 5.2 Secondary Navigation (Contextual)

- **Tool detail panel** - Slide-in drawer with tabs (Overview, Shell, Hooks, Files, History)
- **Installation progress modal** - Full-screen takeover during active installs
- **File diff viewer** - Side-by-side comparison
- **Conflict resolution wizard** - Step-by-step conflict resolution
- **Command palette** - Quick access via ⌘K

## 5.3 Mental Model

```
Tools ←────── are the core entities
   │
   ├──────── have Files (binaries, shims, configs, completions)
   │
   ├──────── have Dependencies (on other tools or binaries)
   │
   ├──────── have Shell Integration (env vars, aliases, functions)
   │
   └──────── are modified by Runs (install, update, generate)
                    │
                    └── which create Operations (file operations)
```

## 5.4 URL Structure

**Routing Library:** `preact-iso` (required)

**Core Principle:** Every view state must be URL-addressable. Users must be able to refresh the browser and land on the exact same screen, including open modals, dialogs, and panel states.

### Primary Routes

| Path                | View                                                               |
| ------------------- | ------------------------------------------------------------------ |
| `/`                 | Dashboard                                                          |
| `/tools`            | Tool catalog                                                       |
| `/tools/:name`      | Tool detail                                                        |
| `/tools/:name/:tab` | Tool detail with specific tab (overview/shell/hooks/files/history) |
| `/tools/graph`      | Dependency graph                                                   |
| `/files`            | File explorer                                                      |
| `/files/timeline`   | Operation timeline                                                 |
| `/updates`          | Update center                                                      |
| `/shell`            | Shell integration                                                  |
| `/shell/:type`      | Shell-specific view (zsh/bash/powershell)                          |
| `/settings`         | Configuration                                                      |
| `/settings/health`  | Health dashboard                                                   |

### Modal & Dialog Routes

Modals and dialogs are URL-driven, not state-driven:

| Path                   | Dialog                             |
| ---------------------- | ---------------------------------- |
| `/tools/:name/install` | Installation modal                 |
| `/tools/:name/update`  | Update confirmation modal          |
| `/tools/:name/remove`  | Remove confirmation modal          |
| `/tools/:name/error`   | Error details modal                |
| `/files/:path/preview` | File preview modal                 |
| `/files/:path/diff`    | File diff viewer                   |
| `/install/progress`    | Active installation progress modal |
| `/conflicts/resolve`   | Conflict resolution wizard         |
| `/search`              | Global search modal (⌘K)           |
| `/export`              | Export options modal               |

### Query Parameters

Filters and view state are preserved in query parameters:

```
/tools?method=github&status=installed&sort=name
/files?tool=fzf&type=shim&after=2026-01-01
/tools/graph?highlight=ripgrep&layout=force
```

## 5.5 Global Elements

### Header

- Logo / product name
- Global search input
- Connection status indicator (🔴 Live / ⚪ Disconnected)
- Settings gear icon

### Sidebar

- Primary navigation links
- Collapsed/expanded toggle
- Active section highlight

### Footer

- Last sync timestamp
- Event count
- Performance stats (optional)

---

[← Back to Index](00-index.md) | [Previous: Objectives & Metrics](04-objectives-metrics.md) | [Next: Core Features →](06-core-features.md)
