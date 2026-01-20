# 10. Required System Enhancements

[← Back to Index](00-index.md) | [Previous: Feasibility Matrix](09-feasibility-matrix.md) | [Next: UI Design System →](11-ui-design-system.md)

---

## 10.1 Event Emission System

**Priority:** High\
**Effort:** Medium

### Current State

Events are emitted only within `InstallerPluginRegistry` for hooks.

### Required Enhancement

Create a centralized event bus that captures all significant operations.

```typescript
// New: packages/events

interface IEventBus {
  emit(event: SystemEvent): void;
  subscribe(filter: EventFilter): AsyncIterable<SystemEvent>;
  getHistory(since: Date): Promise<SystemEvent[]>;
}

type SystemEvent =
  | InstallationEvent
  | PhaseEvent
  | HookEvent
  | DownloadEvent
  | FileOperationEvent
  | LogEvent
  | HealthEvent;
```

### Integration Points

| Component         | Events to Emit                                                         |
| ----------------- | ---------------------------------------------------------------------- |
| Installer         | `installation.start`, `installation.progress`, `installation.complete` |
| Downloader        | `download.start`, `download.progress`, `download.complete`             |
| Archive Extractor | `extract.start`, `extract.progress`, `extract.complete`                |
| Hook Executor     | `hook.start`, `hook.complete`, `hook.error`                            |
| TrackedFileSystem | `file.operation`                                                       |
| Logger            | `log.entry`                                                            |

---

## 10.2 Visualization Server

**Priority:** High\
**Effort:** Medium

### Required Components

1. **Bun HTTP Server**
   - Static file serving for Preact app
   - REST API endpoints
   - WebSocket support

2. **REST API Layer**
   - Tool queries
   - File queries
   - Health checks
   - Configuration

3. **WebSocket Handler**
   - Event streaming
   - Command execution
   - Client subscription management

### Proposed Structure

```
packages/dashboard/
├── src/
│   ├── server/
│   │   ├── index.ts           # Bun HTTP server entry
│   │   ├── routes/            # REST API routes
│   │   ├── websocket/         # WebSocket handlers
│   │   └── services.ts        # Service container
│   ├── client/
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   └── state/
│   └── shared/
│       └── types.ts
```

---

## 10.3 CLI-Server Bridge

**Priority:** High\
**Effort:** Medium

### Purpose

Enable bidirectional communication between CLI and visualization.

### Components

1. **CLI Flag**
   - `--viz-server` to connect to running visualization server
   - Auto-discovery via port/socket

2. **Event Forwarding**
   - CLI operations emit events to connected server
   - Progress updates streamed in real-time

3. **Command Execution**
   - Server can trigger CLI commands
   - Results returned via WebSocket

### Use Cases

| Direction    | Use Case                                             |
| ------------ | ---------------------------------------------------- |
| CLI → Server | Installation progress, log messages, file operations |
| Server → CLI | Install tool, update tool, generate, health check    |

---

## 10.4 Logger Enhancement

**Priority:** Medium\
**Effort:** Small

### Current State

Logger writes to console/file with custom format.

### Required Enhancement

Add callback transport for real-time streaming.

```typescript
// Enhancement to logger config
interface LoggerConfig {
  // Existing...
  onLog?: (logEntry: LogEntry) => void;
}

// Usage
const logger = createLogger({
  onLog: (entry) => {
    eventBus.emit({
      type: 'log.entry',
      ...entry,
    });
  },
});
```

---

## 10.5 Progress Callback Enhancement

**Priority:** Medium\
**Effort:** Small

### Current State

Download progress callback exists but isn't connected to events.

### Required Enhancement

Bridge progress callbacks to event bus.

```typescript
// In Downloader
const progressCallback: ProgressCallback = (downloaded, total) => {
  eventBus.emit({
    type: 'download.progress',
    toolName,
    bytesDownloaded: downloaded,
    totalBytes: total,
    speed: calculateSpeed(),
    eta: calculateEta(),
  });
};
```

---

## 10.6 Service Container

**Priority:** Medium\
**Effort:** Small

### Current State

Services are instantiated per-command in CLI.

### Required Enhancement

Create a shared service container for dashboard use.

```typescript
interface ServiceContainer {
  toolRegistry: IToolInstallationRegistry;
  fileRegistry: IFileRegistry;
  versionChecker: IVersionChecker;
  installer: Installer;
  configLoader: ConfigLoader;
  eventBus: IEventBus;
}

function createServiceContainer(configPath: string): ServiceContainer;
```

---

## 10.7 Implementation Order

1. **Event Bus** - Foundation for all real-time features
2. **Visualization Server** - Required to serve the UI
3. **Logger Enhancement** - Enable log streaming
4. **Progress Callbacks** - Enable download progress
5. **CLI-Server Bridge** - Enable command execution
6. **Service Container** - Clean dependency management

---

[← Back to Index](00-index.md) | [Previous: Feasibility Matrix](09-feasibility-matrix.md) | [Next: UI Design System →](11-ui-design-system.md)
