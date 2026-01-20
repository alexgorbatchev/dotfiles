# @dotfiles/dashboard

Web-based visualization dashboard for the dotfiles-tool-installer system.

## Features

- **Dashboard Overview**: At-a-glance system health, stats, and activity feed
- **Tool Catalog**: Browse, search, and filter all managed tools with file tree view
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

- Stats row (total tools, installed, files tracked)
- Search and method filter
- **Grid view**: Card-based tool listing with click-through to details
- **Files view**: Tree view grouped by tool showing file hierarchy

### Tool Detail (`/tools/:name`)

Detailed view for a single tool:

- Overview tab: Install path, binaries, download URL
- Files tab: Files tracked for this tool
- History tab: Coming soon

### Health (`/health`)

System health checks with pass/warn/fail status.

### Settings (`/settings`)

Project configuration paths display.

## API Endpoints

### Tools API

- `GET /api/tools` - List all tools with full details (name, version, status, install info, files)

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
