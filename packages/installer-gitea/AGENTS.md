# @dotfiles/installer-gitea

Gitea/Forgejo Release installer plugin for the dotfiles tool installer system.

## Purpose

This package provides a plugin implementation for installing tools from Gitea/Forgejo releases. It implements the `IInstallerPlugin` interface from `@dotfiles/core` and supports any Gitea-compatible instance (Gitea, Forgejo, Codeberg, etc.).

## Architecture

- **GiteaReleaseInstallerPlugin**: Plugin class that implements `IInstallerPlugin` interface
- **GiteaApiClient**: HTTP client for the Gitea/Forgejo REST API with caching support
- **installFromGiteaRelease**: Core installation logic
- Schemas defined using Zod for validation
- Dependencies injected through constructor

## Key Differences from GitHub Installer

- Each tool specifies its own `instanceUrl` (e.g., `https://codeberg.org`)
- No gh CLI support (Gitea-specific)
- API client is created per-tool based on the instance URL
- Uses Gitea API v1 (`/api/v1/repos/...`)
- Gitea uses `limit` instead of `per_page` for pagination
