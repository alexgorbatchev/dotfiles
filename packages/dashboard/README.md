# @dotfiles/dashboard

Web-based visualization dashboard for the dotfiles-tool-installer system.

## Features

- **Tools Catalog & Files View**: Browse, search, filter, install, update, and inspect all managed tools and their file trees
- **Drift & 3-Way Difference Inspection**: Inspect synchronization state and visual diffs across declared templates, symlinks, and managed blocks
- **Usage Insights**: See most-used tools, most recently used tools, and per-tool usage breakdowns tracked from shims
- **Health Checks**: System validation with pass, warn, and fail status display
- **Configuration & Settings**: View project paths and directory configuration

## Technology Stack

- **Backend**: Go HTTP Server (with embedded Preact client assets)
- **Frontend**: Preact + Preact-ISO (URL-driven routing)
- **Styling**: Tailwind CSS (via CDN for simplicity)
- **Font**: Maple Mono Normal NF (monospace throughout)

## Usage

The dashboard is started via the CLI:

```bash
# Start dashboard server
dotfiles dashboard

# With custom port
dotfiles dashboard --port 3001

# With specific config
dotfiles --config=./my-config.ts dashboard
```

## UI Pages

### Tools (`/`)

Unified tools, activity, and configuration files view with:

- Stats row (total tools, installed tools, files tracked, binary size)
- Activity row with three cards:
  - Recently Added
  - Most Recently Used (top 10)
  - Most Used (top 10)
- Tool files tree view grouped by configured tool configuration root directories

### Tool Detail (`/tools/:name`)

Detailed view for a single tool:

- Overview panel: install method, version, install date, binary size, source link, dependencies
- Drift & Declarations panel (`ToolDriftCard`): 3-way synchronization state and visual unified diffs for declared templates, symlinks, copies, and managed comment blocks
- Source panel (`ToolSourceCard`): syntax-highlighted `.tool.ts` configuration source viewer
- Usage panel (shown when usage exists): total executions, per-binary counts, and last-used timestamp
- Files panel: files tracked for this tool
- History panel: file operation timeline
- README panel (`ReadmeCard`): rendered markdown README documentation

### Health (`/health`)

System health checks with pass/warn/fail status.

### Settings (`/settings`)

Project configuration paths and directory settings display.

## API Endpoints

### Tools API

- `GET /api/tools` - List all tools with full details (name, version, status, install info, files, usage)
- `GET /api/tools/:name` - Get single tool details
- `GET /api/tools/:name/source` - Get tool `.tool.ts` source code
- `GET /api/tools/:name/readme` - Get tool README markdown payload
- `GET /api/tools/:name/history` - Get tool file operation history
- `POST /api/tools/:name/install` - Install or force-reinstall tool
- `POST /api/tools/:name/update` - Update tool to latest version
- `POST /api/tools/:name/check-update` - Check available updates for tool

### Drift API

- `GET /api/drift` - Inspect drift status and unified diffs across all tools
- `GET /api/tools/:name/drift` - Inspect drift status and diffs for a specific tool

### Tool Configs Tree API

- `GET /api/tool-configs-tree` - Get tool configuration files grouped by root directories

### Recent Tools API

- `GET /api/recent-tools` - Get recently added tool configuration files

### Health API

- `GET /api/health` - Get system health status

### Config API

- `GET /api/config` - Get project configuration paths
