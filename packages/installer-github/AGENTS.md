# @dotfiles/installer-github

GitHub Release installer plugin for the dotfiles tool installer system.

## Purpose

This package provides a plugin implementation for installing tools from GitHub releases. It implements the `IInstallerPlugin` interface from `@dotfiles/installer-plugin-system` and wraps the existing GitHub release installation logic.

## Architecture

- **GitHubReleaseInstallerPlugin**: Plugin class that implements `IInstallerPlugin` interface
- **installFromGitHubRelease**: Core installation logic (existing implementation)
- Schemas defined using Zod for validation
- Dependencies injected through constructor

## Usage

```typescript
import { GitHubReleaseInstallerPlugin } from '@dotfiles/installer-github';
import { InstallerPluginRegistry } from '@dotfiles/installer-plugin-system';

// Create plugin with dependencies
const githubPlugin = new GitHubReleaseInstallerPlugin(
  downloader,
  githubApiClient,
  archiveExtractor,
  projectConfig,
  hookExecutor
);

// Register with registry
const registry = new InstallerPluginRegistry(logger);
await registry.register(githubPlugin);
```

## Dependencies

- `@dotfiles/installer-plugin-system` - Plugin interface definitions
- `@dotfiles/installer` - Existing installer utilities and types
- `@dotfiles/downloader` - File download functionality
- `@dotfiles/archive-extractor` - Archive extraction
- `@dotfiles/file-system` - File system operations
- `@dotfiles/arch` - Platform/architecture detection
- External: `zod`, `minimatch`
