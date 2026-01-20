# 8. Data Architecture

[← Back to Index](00-index.md) | [Previous: Event System](07-event-system.md) | [Next: Feasibility Matrix →](09-feasibility-matrix.md)

---

## 8.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Browser (Preact + Tailwind)                     │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ │
│  │  Dashboard │ │   Tools    │ │   Files    │ │  Updates   │ │   Shell    │ │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘ └────────────┘ │
│                                      │                                       │
│                           WebSocket + REST API                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Bun HTTP Server                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                         REST API Layer                                   ││
│  │  /api/tools      /api/files      /api/updates      /api/config          ││
│  │  /api/health     /api/log        /api/conflicts    /api/shell           ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                      WebSocket Event Stream                              ││
│  │  /ws/events  →  install progress, hooks, logs, file operations          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                        Service Layer                                     ││
│  │  ToolRegistry  FileRegistry  VersionChecker  Installer  ConfigLoader    ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Data Layer                                      │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐ │
│  │    SQLite     │  │  Tool Config  │  │  File System  │  │   Download    │ │
│  │   Databases   │  │    Files      │  │   (Binaries)  │  │    Cache      │ │
│  └───────────────┘  └───────────────┘  └───────────────┘  └───────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 8.2 REST API Endpoints

### Tools API

```
GET   /api/tools                      List all tools with status
GET   /api/tools/:name                Get tool details
GET   /api/tools/:name/files          Get tool's files
GET   /api/tools/:name/history        Get installation history
POST  /api/tools/:name/install        Start installation
POST  /api/tools/:name/update         Start update
DELETE /api/tools/:name               Remove tool
```

### Files API

```
GET   /api/files                      Query file operations (filtered)
GET   /api/files/tree                 Get file system tree
GET   /api/files/stats                Get aggregate statistics
```

### Updates API

```
GET   /api/updates                    Get available updates
POST  /api/updates/check              Trigger update check
```

### Health API

```
GET   /api/health                     Get health status
POST  /api/health/check               Run health checks
```

### Config API

```
GET   /api/config                     Get project configuration
GET   /api/config/tools               Get all tool configurations
```

### Other APIs

```
GET   /api/dependencies/graph         Get dependency graph data
GET   /api/shell/:type                Get shell config preview (zsh/bash/powershell)
```

## 8.3 WebSocket Protocol

### Connection

```
WS /ws/events
```

### Client → Server Messages

```typescript
// Subscribe to events
{
  type: 'subscribe',
  filters: {
    eventTypes?: string[];      // e.g., ['installation.*', 'log.entry']
    toolNames?: string[];       // e.g., ['fzf', 'bat']
    logLevels?: string[];       // e.g., ['info', 'warn', 'error']
  }
}

// Unsubscribe
{
  type: 'unsubscribe',
  filters: { ... }
}

// Execute command
{
  type: 'command',
  action: 'install' | 'update' | 'generate' | 'health-check',
  toolName?: string,
  options?: Record<string, unknown>
}
```

### Server → Client Messages

```typescript
// Event
{
  type: 'event',
  data: VizEvent
}

// Log entry
{
  type: 'log',
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context: string[],
  timestamp: number
}

// Error
{
  type: 'error',
  code: string,
  message: string
}

// Command result
{
  type: 'command.result',
  action: string,
  success: boolean,
  result?: unknown,
  error?: string
}
```

## 8.4 Data Models

### Tool Summary (for catalog)

```typescript
interface ToolSummary {
  name: string;
  version: string | null;
  latestVersion: string | null;
  installMethod: InstallMethod;
  status: 'installed' | 'not-installed' | 'outdated' | 'disabled' | 'error';
  installedAt: Date | null;
  hasUpdate: boolean;
  dependsOn: string[];
}
```

### Tool Detail

```typescript
interface ToolDetail extends ToolSummary {
  installPath: string | null;
  binaryPaths: string[];
  downloadUrl: string | null;
  assetName: string | null;
  configuredVersion: string;
  hooks: HookConfig[];
  shellConfig: {
    zsh?: ShellTypeConfig;
    bash?: ShellTypeConfig;
    powershell?: ShellTypeConfig;
  };
  files: FileState[];
  history: InstallationRecord[];
}
```

### File State

```typescript
interface FileState {
  toolName: string;
  filePath: string;
  fileType: 'binary' | 'shim' | 'symlink' | 'completion' | 'init' | 'config';
  targetPath?: string;
  lastOperation: string;
  lastModified: Date;
  exists: boolean;
  size?: number;
  permissions?: string;
}
```

### Health Check Result

```typescript
interface HealthCheckResult {
  check: string;
  category: 'binaries' | 'shims' | 'symlinks' | 'registry' | 'configs' | 'deps';
  status: 'passed' | 'warning' | 'failed';
  message: string;
  details?: unknown;
  fixAction?: string;
}
```

## 8.5 Data Flow Patterns

| Pattern           | Use Case                         | Implementation           |
| ----------------- | -------------------------------- | ------------------------ |
| **Polling**       | Dashboard stats, health checks   | REST API, 5-30s interval |
| **WebSocket**     | Installation progress, live logs | Bidirectional, real-time |
| **SSE**           | Activity feed (optional)         | Server-push, lightweight |
| **Direct SQLite** | Analytics, history queries       | Read-only connection     |

---

[← Back to Index](00-index.md) | [Previous: Event System](07-event-system.md) | [Next: Feasibility Matrix →](09-feasibility-matrix.md)
