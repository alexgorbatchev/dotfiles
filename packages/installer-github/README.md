# @dotfiles/installer-github

Installer plugin for tools distributed via GitHub Releases.

## Overview

This package provides comprehensive installation capabilities for CLI tools distributed through GitHub Releases. It integrates with the GitHub API to fetch release information, select appropriate assets for the current platform, and handle both archive and direct binary downloads.

## Usage

Tools are configured using `defineTool` with the `install()` function:

```typescript
import { defineTool } from '@dotfiles/cli';

export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'BurntSushi/ripgrep',
  }).bin('rg')
);
```

### Parameters

The `install('github-release', params)` function accepts the following parameters:

- **repo** (required): GitHub repository in `owner/repo` format (e.g., `junegunn/fzf`)
- **version** (optional): Specific version tag or SemVer constraint (defaults to `latest`)
- **assetPattern** (optional): Glob or regex pattern to match asset filenames.
  - Glob example: `*linux_amd64.tar.gz`
  - Regex string example: `/^bun-.*\\.zip$/`
  - TypeScript only: a real `RegExp` value (e.g. `/^bun-.*\.zip$/`)
- **assetSelector** (optional): Custom function for advanced asset selection logic
- **ghCli** (optional): Use `gh` CLI for GitHub API requests instead of fetch. Useful when working behind corporate proxies or leveraging existing `gh` authentication.
- **prerelease** (optional): Include prerelease versions when fetching latest. Set to `true` for repos that only publish prereleases (default: `false`).
- **env** (optional): Environment variables for the installation process
- **hooks** (optional): Lifecycle hooks (`beforeInstall`, `afterDownload`, `afterExtract`, `afterInstall`)

### Examples

#### Basic Installation

```typescript
export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'sharkdp/bat',
  }).bin('bat')
);
```

#### With Specific Version

```typescript
export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'junegunn/fzf',
    version: 'v0.48.0',
  }).bin('fzf')
);
```

#### With Asset Pattern

```typescript
export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'caddyserver/caddy',
    assetPattern: 'caddy_*.tar.gz',
  }).bin('caddy')
);
```

#### Using gh CLI

Use the `gh` CLI for API requests (requires `gh` to be installed and authenticated):

```typescript
export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'junegunn/fzf',
    ghCli: true,
  }).bin('fzf')
);
```

#### Including Prereleases

For repositories that only publish prerelease versions (e.g., nightly builds):

```typescript
export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'owner/nightly-tool',
    prerelease: true,
  }).bin('tool')
);
```

#### With Custom Asset Selector

```typescript
export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'example/tool',
    assetSelector: (context) => {
      const { assets, systemInfo } = context;
      return assets.find((asset) => asset.name.includes(systemInfo.platform) && asset.name.endsWith('.tar.gz'));
    },
  }).bin('tool')
);
```

#### With Hooks

```typescript
export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'example/tool',
  })
    .bin('tool')
    .hooks({
      afterExtract: async (ctx) => {
        // Post-extraction setup
      },
    })
);
```

## Features

### GitHub API Integration

**Release Fetching**: Retrieves release information via GitHub API with support for latest releases, specific tags, and version constraints.

**Asset Metadata**: Accesses complete release metadata including asset names, sizes, download URLs, and publication dates.

**Authentication**: Supports GitHub authentication tokens for higher rate limits and private repositories.

**Rate Limit Handling**: Integrates with GitHub API client's rate limit handling and error recovery.

### Platform Detection

Automatically selects appropriate assets for the current platform and architecture using intelligent pattern matching that understands common naming conventions.

### Asset Selection Strategies

**Pattern Matching**: Uses minimatch for flexible glob pattern matching against asset names.

**Custom Logic**: Supports custom selector functions with full context including assets, system info, logger, and configuration.

**Automatic Selection**: Falls back to intelligent platform-based selection using the arch package.

### Download URL Construction

Handles both absolute and relative download URLs with support for:

- Public GitHub (github.com)
- GitHub Enterprise installations
- Custom API endpoints
- Proper URL resolution and validation

### Archive Handling

**Format Detection**: Automatically detects archive files by extension (.tar.gz, .tgz, .zip, .tar).

**Extraction**: Extracts archives to the installation directory with full path preservation.

**Binary Location**: Supports binaries at any depth within archives using flexible path resolution.

### Direct Binary Support

For non-archive releases, handles direct binary downloads with automatic executable permission setup.

### Lifecycle Hooks

Supports two installation lifecycle hooks:

- **afterDownload**: Executed after asset download, before extraction/binary setup
- **afterExtract**: Executed after extraction (archives only), before binary setup

### Update Management

**Update Checking**: Queries GitHub API to compare installed version against latest release.

**Version Updates**: Supports updating to specific versions or latest release with versioned directory management.

**Force Updates**: Supports force reinstallation via update options.

## Implementation Details

### Installation Process

1. Fetches release information from GitHub API (latest or specific version)
2. Selects the appropriate asset based on platform, architecture, and configuration
3. Constructs and validates the download URL
4. Downloads the asset with progress display
5. Executes afterDownload hook if configured
6. For archives: extracts, executes afterExtract hook, and sets up binaries
7. For direct binaries: sets up the binary directly
8. Cleans up downloaded archives

### Update Checking

The plugin queries GitHub API for the latest release and compares versions to support update detection.

## Plugin Interface

Implements `IInstallerPlugin` with:

- **Method**: `github-release`
- **Schemas**: `githubReleaseInstallParamsSchema`, `githubReleaseToolConfigSchema`
- **Update Check**: Fully supported
- **Update Tool**: Fully supported with version management
- **README URL**: Supported (constructs GitHub raw URLs)

## Type Augmentation

This package extends the core type system via module augmentation:

```typescript
declare module '@dotfiles/core' {
  interface IInstallParamsRegistry {
    'github-release': GithubReleaseInstallParams;
  }
  interface IToolConfigRegistry {
    'github-release': GithubReleaseToolConfig;
  }
  interface IPluginResultRegistry extends RegisterPluginResult<'github-release', GitHubReleaseInstallResult> {}
}
```

## Result Type

Installation returns `GitHubReleaseInstallResult`:

```typescript
{
  success: true,
  binaryPaths: string[],       // Paths to installed binaries
  version: string,              // Normalized version string
  originalTag: string,          // Original GitHub release tag
  metadata: {
    method: 'github-release',
    releaseUrl: string,
    publishedAt: string,
    releaseName: string,
    downloadUrl: string,
    assetName: string
  }
}
```

## GitHub Enterprise Support

Supports GitHub Enterprise installations through configuration:

- Custom API endpoints via `projectConfig.github.host`
- Custom authentication tokens via `projectConfig.github.token`
- Custom User-Agent strings via `projectConfig.github.userAgent`

## Caching

Leverages GitHub API client's built-in caching for:

- Release information
- API rate limit status
- Reduced API calls and faster repeated operations
