# pkg

Install macOS `.pkg` installer packages with the system `installer` command.

Use this for tools distributed as signed Apple installer packages instead of tarballs, binaries, or DMGs.

## Basic Usage

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install("pkg", {
    source: {
      type: "url",
      url: "https://example.com/releases/my-tool.pkg",
    },
  }).bin("my-tool"),
);
```

## Parameters

- `source` (required)
  - `{ type: 'url', url }`
  - `{ type: 'github-release', repo, version?, assetPattern?, ghCli?, prerelease? }`
- `target` (optional): target volume for `installer -target`. Defaults to `'/'`.
- `binaryPath` (optional): absolute path to the primary installed binary. If omitted, each declared `.bin()` name is resolved from `PATH` after install.
- `versionArgs` (optional): args used for version detection.
- `versionRegex` (optional): regex used for version detection.
- `token` (optional): GitHub API token for a `github-release` source.

## Examples

```typescript body
install("pkg", {
  source: {
    type: "url",
    url: "https://example.com/releases/my-tool.pkg",
  },
  binaryPath: "/usr/local/bin/my-tool",
}).bin("my-tool");
```

```typescript body
install("pkg", {
  source: {
    type: "github-release",
    repo: "owner/tool",
    assetPattern: "*macos*.pkg",
  },
})
  .bin("tool")
  .sudo();
```

## Notes

- macOS only. Non-macOS platforms skip this install method.
- `.pkg`-installed tools are externally managed: the macOS installer owns the files, and `.bin()` names the executables the package provides so dotfiles can shim them (see [`.bin()` runtime behavior](../api-reference/core-api.md#binname-runtime-behavior)).
- Packages that declare root authorization should opt into `.sudo()` so explicit `dotfiles install <tool>` runs execute the macOS installer via `sudo`.
- GUI-only packages can omit `.bin()`.
- If the binary is not on PATH after installation, set `binaryPath` explicitly.
