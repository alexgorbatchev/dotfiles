# @dotfiles/schemas

This package provides TypeScript type definitions and Zod validation schemas that are used throughout the dotfiles management system. It serves as the single source of truth for the data structures that define tool configurations, installation processes, and system interactions.

## Core Concepts

The schemas are organized by domain, ensuring a clear and maintainable structure.

### `common`

Contains foundational types that are used across multiple domains:

- **`Platform` & `Architecture`**: Bitwise enums for defining platform and architecture compatibility (e.g., `Platform.Linux | Platform.MacOS`).
- **`Version`**: Types and utilities for handling SemVer versioning.
- **`SystemInfo`**: A structure for representing the current system's OS, architecture, and home directory.
- **`BaseToolContext`**: A shared context interface providing access to paths, configuration, and logging.

### `config`

Defines the Zod schema for the main `config.yaml` file (`yamlConfigSchema`). This includes detailed schemas for:

- `paths`: Directory paths with support for variable expansion.
- `github`, `cargo`, `downloader`: Configuration for external services.
- `updates`, `logging`, `system`: System-level settings.
- `platform`: Platform-specific configuration overrides.

### `installer`

Contains types and interfaces related to the tool installation process:

- **`IArchiveExtractor`**: An interface for archive extraction services, with types for formats (`ArchiveFormat`), options, and results.
- **`IGitHubApiClient`**: An interface for interacting with the GitHub API, including types for releases (`GitHubRelease`) and assets (`GitHubReleaseAsset`).
- **`InstallHookContext`**: The context object passed to installation hooks, providing access to system info, paths, and shell commands.
- **`AsyncInstallHook`**: The type definition for asynchronous functions that can be hooked into the installation lifecycle (e.g., `beforeInstall`, `afterExtract`).

### `shell`

Provides branded types and utilities for handling shell scripts:

- **`OnceScript` & `AlwaysScript`**: Branded string types to distinguish between scripts that run once (e.g., for setup) and scripts that run on every shell startup (e.g., for `eval`).
- **`once()` & `always()`**: Tagged template functions to create these branded types, improving clarity in tool configurations.

### `tool-config`

This is the most extensive module, defining the Zod schemas for individual tool configurations (`*.tool.ts` files). It provides a structured way to define how a tool is installed, configured, and integrated into the system. Key schemas include:

- **`ToolConfig`**: The root schema for a tool configuration.
- **Installation Methods**: Schemas for various installation strategies like `githubRelease`, `brew`, `cargo`, `curlScript`, and `manual`.
- **`Binaries`**: Defines how to handle tool binaries, including path resolution and renaming.
- **`Symlinks`**: Specifies files to be symlinked from the dotfiles repository.
- **Shell-Specific Configuration**: Schemas for `zsh`, `bash`, and other shells to define environment variables, aliases, and initialization scripts.

## Usage

These schemas are primarily used internally by other packages in the project. For example, the `@dotfiles/installer` package relies on the installer schemas, and the `@dotfiles/config` package uses the `yamlConfigSchema` to parse the main configuration file.

When developing new tool configurations or extending the system, you can import types and schemas directly from this package:

```typescript
// Import the main tool configuration type
import type { ToolConfig } from '@dotfiles/schemas';

// Import specific types for platform or installation
import { Platform, type GitHubReleaseInstall } from '@dotfiles/schemas';
```
