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
| `sha256`        | `string`                                           | No       | Expected checksum of the downloaded archive                                                                                                                    |

The version to install comes from `.version()`. With `binarySource: 'github-releases'`, a pinned version is downloaded from the release the repository really tagged it with: the asset is fetched from tag `v<version>`, and from tag `<version>` when the first answers 404. No GitHub API request is made for it. When the prebuilt download fails, the crate is compiled with `cargo install`. Binaries are declared with `.bin()`, as for every other method.

Update checks (`dotfiles tool check`, `dotfiles update`, the dashboard) ask the same `versionSource` for the latest version that an install without `.version()` would get, so the default is crates.io. A pinned `.version()` does not change what the check reports as the latest version. When the query fails, the check fails for that tool instead of reporting it as up to date.

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
