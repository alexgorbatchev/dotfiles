# @dotfiles/registry

Registry management for the dotfiles generator - tracks files and tool installations.

## Features

- **File Registry**: Tracks symlinks, copies, and file modifications
- **Tool Installation Registry**: Tracks installed tool versions and metadata

## Usage

### File Registry

```typescript
import { SqliteFileRegistry, TrackedFileSystem } from '@dotfiles/registry/file';

const registry = new SqliteFileRegistry(logger, registryDb);
const trackedFs = new TrackedFileSystem(logger, fs, registry, 'tool-name', homeDir);

// File operations are automatically tracked
await trackedFs.symlink('/source', '/target');
```

### Tool Installation Registry

```typescript
import { SqliteToolInstallationRegistry } from '@dotfiles/registry/tool';

const registry = new SqliteToolInstallationRegistry(logger, registryDb);
await registry.saveInstallation('my-tool', '1.0.0', { /* metadata */ });
```
