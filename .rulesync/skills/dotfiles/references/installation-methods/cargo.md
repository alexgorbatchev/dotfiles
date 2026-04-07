# Cargo Installation

Installs Rust tools from crates.io using pre-compiled binaries via cargo-quickinstall or GitHub releases.

## Basic Usage

```typescript
import { defineTool } from '@alexgorbatchev/dotfiles';

export default defineTool((install, ctx) =>
  install('cargo', {
    crateName: 'ripgrep',
  }).bin('rg')
);
```

## Parameters

| Parameter        | Type                                               | Required | Description                                            |
| ---------------- | -------------------------------------------------- | -------- | ------------------------------------------------------ |
| `crateName`      | `string`                                           | Yes      | Name of the Rust crate                                 |
| `binarySource`   | `'cargo-quickinstall' \| 'github-releases'`        | No       | Binary download source (default: `cargo-quickinstall`) |
| `versionSource`  | `'cargo-toml' \| 'crates-io' \| 'github-releases'` | No       | Version detection source (default: `cargo-toml`)       |
| `githubRepo`     | `string`                                           | No       | GitHub repo in `owner/repo` format                     |
| `assetPattern`   | `string`                                           | No       | Pattern for GitHub release assets                      |
| `cargoTomlUrl`   | `string`                                           | No       | Custom Cargo.toml URL                                  |
| `customBinaries` | `string[]`                                         | No       | Custom binary names if different from crate            |
| `env`            | `Record<string, string> \| (ctx) => Record<...>`   | No       | Environment variables (static or dynamic function)     |

### Asset Pattern Placeholders

| Placeholder   | Description          |
| ------------- | -------------------- |
| `{version}`   | Resolved version     |
| `{platform}`  | Current platform     |
| `{arch}`      | Current architecture |
| `{crateName}` | Crate name           |

## Examples

### From GitHub Releases

```typescript
export default defineTool((install, ctx) =>
  install('cargo', {
    crateName: 'bat',
    binarySource: 'github-releases',
    githubRepo: 'sharkdp/bat',
    assetPattern: 'bat-v{version}-{arch}-{platform}.tar.gz',
  }).bin('bat')
);
```

### Custom Binary Names

```typescript
export default defineTool((install, ctx) =>
  install('cargo', {
    crateName: 'fd-find',
    customBinaries: ['fd'],
  }).bin('fd')
);
```

### With Hooks

```typescript
export default defineTool((install, ctx) =>
  install('cargo', {
    crateName: 'tool',
  })
    .bin('tool')
    .hook('after-install', async (ctx) => {
      // Post-installation setup
    })
);
```

## Platform Mapping

| System | Architecture | Rust Target Triple          |
| ------ | ------------ | --------------------------- |
| macOS  | arm64        | `aarch64-apple-darwin`      |
| macOS  | x64          | `x86_64-apple-darwin`       |
| Linux  | x64          | `x86_64-unknown-linux-gnu`  |
| Linux  | arm64        | `aarch64-unknown-linux-gnu` |
