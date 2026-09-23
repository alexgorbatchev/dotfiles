# cargo

Installs Rust tools from crates.io using pre-compiled binaries via cargo-quickinstall or GitHub releases.

## Basic Usage

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install, ctx) =>
  install("cargo", {
    crateName: "ripgrep",
  }).bin("rg"),
);
```

## Parameters

| Parameter       | Type                                               | Required | Description                                                                                                                                                    |
| --------------- | -------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `crateName`     | `string`                                           | No       | Name of the Rust crate (defaults to the tool name)                                                                                                             |
| `binarySource`  | `'cargo-quickinstall' \| 'github-releases'`        | No       | Binary download source (default: `cargo-quickinstall`)                                                                                                         |
| `versionSource` | `'cargo-toml' \| 'crates-io' \| 'github-releases'` | No       | Version detection source (default: `cargo-toml` when `cargoTomlUrl` is set, `github-releases` when `binarySource` is `github-releases`, otherwise `crates-io`) |
| `githubRepo`    | `string`                                           | No       | GitHub repo in `owner/repo` format, for `github-releases`                                                                                                      |
| `assetPattern`  | `string`                                           | No       | Pattern for GitHub release assets                                                                                                                              |
| `cargoTomlUrl`  | `string`                                           | No       | Cargo.toml to read the version from with `versionSource: 'cargo-toml'` (default: `main` branch of `githubRepo` on raw.githubusercontent.com)                   |
| `prerelease`    | `boolean`                                          | No       | Resolve the latest version including prereleases (default: `false`, the newest stable release); see [Prereleases](#prereleases)                                |
| `sha256`        | `string`                                           | No       | Expected checksum of the downloaded archive                                                                                                                    |

The version to install comes from `.version()`. With `binarySource: 'github-releases'`, a pinned version is downloaded from the release the repository really tagged it with: the asset is fetched from tag `v<version>`, and from tag `<version>` when the first answers 404. No GitHub API request is made for it. When the prebuilt download fails, the crate is compiled with `cargo install`: with `--version` set to the pinned version, or to the version crates.io resolved, so the fallback installs the same version as the download would have. A version read from a Cargo.toml or a release tag is not known to be published on crates.io, so without `prerelease: true` the fallback lets `cargo install` pick its own newest stable release instead, as it does when no version could be resolved. Binaries are declared with `.bin()`, as for every other method.

Update checks (`dotfiles tool check`, `dotfiles update`, the dashboard) ask the same `versionSource` for the latest version that an install without `.version()` would get, so the default is crates.io. A pinned `.version()` does not change what `dotfiles tool check` or the dashboard's check reports as the latest version. `dotfiles update` refuses a pinned tool without checking it ([`tool update`](../getting-started/cli-reference.md#dotfiles-tool-update-tool)). When the query fails, the check fails for that tool instead of reporting it as up to date.

### Prereleases

With the `crates-io` and `github-releases` version sources, the latest version is the newest stable release, as it is for `cargo install` itself. From crates.io that is the highest version that is not a prerelease (`max_stable_version`); from GitHub releases it is the release GitHub marks as latest, which is never a prerelease. A crate that has published only prereleases to crates.io fails to resolve and to install, with an error naming the crate, instead of moving onto a prerelease.

`prerelease: true` lets the latest version be a prerelease. crates.io then answers with the highest version of any kind (`max_version`), and GitHub releases with the newest published release, drafts excluded. The setting applies to installs without `.version()` and to update checks alike. The `cargo install` fallback then compiles the resolved version from any version source, and when it has no `MAJOR.MINOR.PATCH` version to compile the install fails rather than compiling the newest stable release. A pinned `.version()` is installed as written either way, and `versionSource: 'cargo-toml'` downloads the version the Cargo.toml declares, prerelease or not.

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
  install("cargo", {
    crateName: "bat",
    binarySource: "github-releases",
    githubRepo: "sharkdp/bat",
    assetPattern: "bat-v{version}-{arch}-{platform}.tar.gz",
  }).bin("bat"),
);
```

### Tracking Prereleases

```typescript
export default defineTool((install, ctx) =>
  install("cargo", {
    crateName: "tauri-cli",
    prerelease: true,
  }).bin("cargo-tauri"),
);
```

### Binary Named Differently From the Crate

```typescript
export default defineTool((install, ctx) =>
  install("cargo", {
    crateName: "fd-find",
  }).bin("fd"),
);
```

### With Hooks

```typescript
export default defineTool((install, ctx) =>
  install("cargo", {
    crateName: "tool",
  })
    .bin("tool")
    .hook("after-install", async (ctx) => {
      // Post-installation setup
    }),
);
```

## Platform Mapping

| System | Architecture | Rust Target Triple          |
| ------ | ------------ | --------------------------- |
| macOS  | arm64        | `aarch64-apple-darwin`      |
| macOS  | x64          | `x86_64-apple-darwin`       |
| Linux  | x64          | `x86_64-unknown-linux-gnu`  |
| Linux  | arm64        | `aarch64-unknown-linux-gnu` |
