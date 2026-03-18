# @dotfiles/dashboard

Web-based visualization dashboard for the dotfiles-tool-installer system.

## Features

- **Dashboard Overview**: At-a-glance system health, stats, and activity feed
- **Tool Catalog**: Browse, search, and filter all managed tools with file tree view
- **Usage Insights**: See most-used tools, most recently used tools, and per-tool usage breakdowns
- **Health Checks**: System validation with health status display
- **Settings**: View project configuration paths

## Technology Stack

- **Runtime**: Bun HTTP Server
- **Frontend**: Preact + Preact-ISO (URL-driven routing)
- **Styling**: Tailwind CSS (via CDN for simplicity)
- **Font**: Maple Mono Normal NF (monospace throughout)

## Usage

The dashboard is started via the CLI:

```bash
# Start dashboard server
bun cli dashboard

# With custom port
bun cli dashboard --port 3001

# With specific config
bun cli --config=./my-config.ts dashboard
```

## UI Pages

### Dashboard (`/`)

Overview page with:

- Stats cards (tools count, installed count, files tracked, operations)
- Recent installations list
- Installation method distribution chart

### Tools (`/tools`)

Unified tools and files view with:

- Stats row (total tools, installed, files tracked, binary size)
- Activity row with three cards:
  - Recently Added
  - Most Recently Used (top 10)
  - Most Used (top 10)
- Tool files tree view

### Tool Detail (`/tools/:name`)

Detailed view for a single tool:

- Overview panel: install source, version, install date, binary size, dependencies
- Usage panel (shown only when usage exists): total runs + per-binary counts and last-used timestamp
- Files panel: files tracked for this tool
- History panel: file operation timeline

### Health (`/health`)

System health checks with pass/warn/fail status.

### Settings (`/settings`)

Project configuration paths display.

## API Endpoints

### Tools API

- `GET /api/tools` - List all tools with full details (name, version, status, install info, files, usage)

### Stats API

- `GET /api/stats` - Get aggregate statistics (tools count, files count, operations count)

### Health API

- `GET /api/health` - Get health status

### Config API

- `GET /api/config` - Get project configuration

### Shell API

- `GET /api/shell` - Get shell integration info (completions, init scripts)

### Activity API

- `GET /api/activity` - Get recent file operations with relative timestamps
