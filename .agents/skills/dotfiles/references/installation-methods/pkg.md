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
  - `{ type: 'github-release', repo, version?, assetPattern?, assetSelector?, ghCli?, prerelease? }`
- `target` (optional): target volume for `installer -target`. Defaults to `'/'`.
- `binaryPath` (optional): absolute path to the primary installed binary. If omitted, each declared `.bin()` name is resolved with `command -v` after install.
- `versionArgs` (optional): args used for version detection.
- `versionRegex` (optional): regex used for version detection.

## Examples

```typescript
install("pkg", {
  source: {
    type: "url",
    url: "https://example.com/releases/my-tool.pkg",
  },
  binaryPath: "/usr/local/bin/my-tool",
}).bin("my-tool");
```

```typescript
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
- `.pkg` installers are externally managed after installation.
- Packages that declare root authorization should opt into `.sudo()` so explicit `dotfiles install <tool>` runs execute the macOS installer via `sudo`.
- GUI-only packages can omit `.bin()`.
- If the binary is not on PATH after installation, set `binaryPath` explicitly.
