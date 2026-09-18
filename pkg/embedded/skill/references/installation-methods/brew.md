# brew

Install tools using Homebrew package manager on macOS and Linux.

Tools using the `brew` installation method automatically declare a dependency on `brew`, ensuring that if a `tools/brew.tool.ts` is configured in the project, Homebrew is provisioned first on virgin machines before formula installation.

Homebrew-installed tools are externally managed: Homebrew owns the files, and `.bin()` names the executables it provides so dotfiles can shim them (see [`.bin()` runtime behavior](../api-reference/core-api.md#binname-runtime-behavior)).

## Basic Usage

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) => install("brew", { formula: "ripgrep" }).bin("rg"));
```

## Parameters

| Parameter      | Description                                                                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `formula`      | Formula or cask name (defaults to tool name)                                                                                                                   |
| `cask`         | Set `true` for cask installation                                                                                                                               |
| `tap`          | Tap(s) to add before installing (`brew tap <target>`)                                                                                                          |
| `trust`        | Tap(s) or formula(s) to explicitly trust before tapping/installing (`brew trust <target>`). Set `true` to auto-trust configured `tap`(s). Defaults to `false`. |
| `args`         | Additional CLI flags passed directly to `brew install` (e.g. `['--HEAD']`, `['--build-from-source']`)                                                          |
| `force`        | Pass `--force` to `brew install`. Defaults to `false`.                                                                                                         |
| `service`      | Run `brew services <action> <formula>` after install; `true` means `start`, a string is used as the action (e.g. `'start'`, `'run'`)                           |
| `link`         | Run `brew link` after install: `true` links, `{ force?: boolean, overwrite?: boolean }` adds the matching flags, `false` or omitted never links                |
| `versionArgs`  | Arguments for version check (e.g., `['--version']`); without them the version comes from `brew info`                                                           |
| `versionRegex` | Regex to extract version from output (`string` or `RegExp`)                                                                                                    |

## Examples

### Homebrew Cask

```typescript body
install("brew", {
  formula: "visual-studio-code",
  cask: true,
});
```

### With Tap Trust & Custom Tap

```typescript body
install("brew", {
  formula: "borders",
  tap: "FelixKratz/formulae",
  trust: true, // Automatically trusts "FelixKratz/formulae" before tapping
});
```

### Background Service & Keg-Only Linking

```typescript body
install("brew", {
  formula: "redis",
  service: "start",
  link: { overwrite: true },
});
```

### Build Flags

```typescript body
install("brew", {
  formula: "custom-tool",
  args: ["--build-from-source"],
});
```

## Platform Support

| Platform | Support                 |
| -------- | ----------------------- |
| macOS    | Full (formulas + casks) |
| Linux    | Formulas only           |
| Windows  | Not supported           |
