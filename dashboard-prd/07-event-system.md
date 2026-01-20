# 7. Real-Time Event System

[← Back to Index](00-index.md) | [Previous: Core Features](06-core-features.md) | [Next: Data Architecture →](08-data-architecture.md)

---

## 7.1 Event Types

The visualization requires real-time updates during operations. These events will be streamed:

| Event Type              | Payload                                            | Trigger               |
| ----------------------- | -------------------------------------------------- | --------------------- |
| `installation.start`    | `{ toolName, method, version }`                    | Installation begins   |
| `installation.progress` | `{ toolName, phase, percent, message }`            | Progress update       |
| `installation.complete` | `{ toolName, success, duration, version }`         | Installation ends     |
| `phase.start`           | `{ toolName, phase, metadata }`                    | Phase begins          |
| `phase.complete`        | `{ toolName, phase, duration, status }`            | Phase ends            |
| `hook.start`            | `{ toolName, hook, context }`                      | Hook execution starts |
| `hook.complete`         | `{ toolName, hook, duration, status, output }`     | Hook execution ends   |
| `download.progress`     | `{ toolName, bytesDownloaded, totalBytes, speed }` | Download progress     |
| `file.operation`        | `{ toolName, operation, path, type }`              | File operation occurs |
| `log.entry`             | `{ level, message, context, timestamp }`           | Log message emitted   |
| `config.change`         | `{ toolName, changes }`                            | Configuration changed |
| `health.update`         | `{ check, status, details }`                       | Health status changed |

## 7.2 Event Schema

```typescript
type VizEvent =
  | InstallationStartEvent
  | InstallationProgressEvent
  | InstallationCompleteEvent
  | PhaseStartEvent
  | PhaseCompleteEvent
  | HookStartEvent
  | HookCompleteEvent
  | DownloadProgressEvent
  | FileOperationEvent
  | LogMessageEvent
  | ConfigChangeEvent
  | HealthUpdateEvent;

interface BaseEvent {
  id: string; // UUID
  type: string; // Event type discriminator
  timestamp: number; // High-resolution timestamp
  toolName?: string; // Tool context (if applicable)
}

interface InstallationStartEvent extends BaseEvent {
  type: 'installation.start';
  method: string;
  version: string;
  platform: string;
  arch: string;
}

interface InstallationProgressEvent extends BaseEvent {
  type: 'installation.progress';
  phase: string;
  percent: number;
  message: string;
}

interface PhaseStartEvent extends BaseEvent {
  type: 'phase.start';
  phase: 'validate' | 'download' | 'extract' | 'setup' | 'hooks';
  metadata: Record<string, unknown>;
}

interface DownloadProgressEvent extends BaseEvent {
  type: 'download.progress';
  bytesDownloaded: number;
  totalBytes: number;
  speed: number; // bytes/sec
  eta: number; // seconds
}

interface FileOperationEvent extends BaseEvent {
  type: 'file.operation';
  operation: 'create' | 'write' | 'symlink' | 'chmod' | 'delete';
  path: string;
  fileType: string;
  size?: number;
  permissions?: string;
}

interface LogMessageEvent extends BaseEvent {
  type: 'log.entry';
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context: string[]; // Logger hierarchy
}
```

## 7.3 Event Flow

```
CLI Process                    Event Bus               Viz Server              Browser
───────────                    ─────────               ──────────              ───────
                                                                               
Install Start ───────────────▶ Emit Event ───────────▶ Forward ──────────────▶ Update UI
                                                       WebSocket
                                                       
Download Progress (×N) ──────▶ Emit Event ───────────▶ Forward ──────────────▶ Progress Bar

Hook Execution ──────────────▶ Emit Event ───────────▶ Forward ──────────────▶ Phase Status

File Operation (×N) ─────────▶ Emit Event ───────────▶ Forward ──────────────▶ File List
                               + Persist

Install Complete ────────────▶ Emit Event ───────────▶ Forward ──────────────▶ Success State
                               + Persist                                        Notifications
```

## 7.4 Event Buffering

When the visualization server is not connected, events should be buffered:

- **Buffer Size:** 1000 events (configurable)
- **Buffer Strategy:** Ring buffer (oldest events dropped)
- **Replay:** On new connection, replay buffered events
- **Persistence:** Critical events (install complete, errors) persisted to registry

## 7.5 Event Filtering

Clients can subscribe to specific event types:

```typescript
// Client → Server
{
  type: 'subscribe',
  filters: {
    eventTypes: ['installation.*', 'log.entry'],
    toolNames: ['fzf', 'bat'],
    logLevels: ['info', 'warn', 'error']
  }
}

// Server → Client (filtered events only)
{
  type: 'event',
  data: { ... }
}
```

---

[← Back to Index](00-index.md) | [Previous: Core Features](06-core-features.md) | [Next: Data Architecture →](08-data-architecture.md)
