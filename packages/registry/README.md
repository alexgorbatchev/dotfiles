# @dotfiles/registry

Registry management for the dotfiles generator - tracks files and tool installations.

## Features

- **File Registry**: Tracks symlinks, copies, and file modifications
- **Tool Installation Registry**: Tracks installed tool versions and metadata
- **Tool Usage Registry**: Tracks per-binary invocation counts and last-used timestamps

## Usage

### File Registry

```typescript
import { SqliteFileRegistry, TrackedFileSystem } from "@dotfiles/registry/file";

const registry = new SqliteFileRegistry(logger, registryDb);
const trackedFs = new TrackedFileSystem(logger, fs, registry, "tool-name", homeDir);

// File operations are automatically tracked
await trackedFs.symlink("/source", "/target");
```

### Tool Installation Registry

```typescript
import { ToolInstallationRegistry } from "@dotfiles/registry/tool";

const registry = new ToolInstallationRegistry(logger, registryDb);
await registry.recordToolInstallation({
  toolName: "my-tool",
  version: "1.0.0",
  installPath: "/path/to/install",
  timestamp: "2026-01-01-00-00-00",
  binaryPaths: ["/path/to/install/my-tool"],
});

await registry.recordToolUsage("my-tool", "my-tool");
const usage = await registry.getToolUsage("my-tool", "my-tool");
// usage?.usageCount, usage?.lastUsedAt
```
