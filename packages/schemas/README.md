# @dotfiles/schemas

Type definitions and Zod validation schemas for the dotfiles generator.

## Features

- **Common**: Foundational types (platform, architecture, version, system info)
- **Installer**: Installation-related types (hooks, archives, downloads, GitHub API)
- **Shell**: Shell script types and utilities
- **Tool Config**: Comprehensive tool configuration schemas organized by:
  - Base schemas (common properties, binaries, symlinks)
  - Installation methods (GitHub releases, Brew, Cargo, curl, manual)
  - Platform-specific configurations
  - Shell configurations (Zsh, Bash, PowerShell)
  - Builder API types

## Usage

```typescript
// Import everything
import { ToolConfig, Platform, Architecture } from '@dotfiles/schemas';

// Import from specific modules
import { ToolConfig } from '@dotfiles/schemas/tool-config';
import { Platform, Architecture } from '@dotfiles/schemas/common';
import { InstallHooks } from '@dotfiles/schemas/installer';
```

## Structure

All types and schemas are organized by domain for better discoverability and maintainability.
