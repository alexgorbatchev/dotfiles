# brew

Install tools using Homebrew package manager on macOS and Linux.

Tools using the `brew` installation method automatically declare a dependency on `brew`, ensuring that if a `tools/brew.tool.ts` is configured in the project, Homebrew is provisioned first on virgin machines before formula installation.

Shims are not supported for Homebrew-installed tools. The `.bin()` method should not be used with this installer. Homebrew manages binary placement and PATH integration natively.

## Basic Usage

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) => install("brew", { formula: "ripgrep" }));
```

## Parameters

| Parameter      | Description                                                                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `formula`      | Formula or cask name (defaults to tool name)                                                                                                                   |
| `cask`         | Set `true` for cask installation                                                                                                                               |
| `tap`          | Tap(s) to add before installing (`brew tap <target>`)                                                                                                          |
| `trust`        | Tap(s) or formula(s) to explicitly trust before tapping/installing (`brew trust <target>`). Set `true` to auto-trust configured `tap`(s). Defaults to `false`. |
| `args`         | Additional CLI flags passed directly to `brew install` (e.g. `['--HEAD']`, `['--build-from-source']`)                                                          |
| `service`      | Automatically start background daemon after install (`true`, `'start'`, or `'run'`)                                                                            |
| `link`         | Force symlinking keg-only or conflicting formulas (`true` or `{ force?: boolean, overwrite?: boolean }`)                                                       |
| `versionArgs`  | Arguments for version check (e.g., `['--version']`)                                                                                                            |
| `versionRegex` | Regex to extract version from output (`string` or `RegExp`)                                                                                                    |
| `env`          | Environment variables (static or dynamic function)                                                                                                             |

## Examples

### Homebrew Cask

```typescript
install("brew", {
  formula: "visual-studio-code",
  cask: true,
});
```

### With Tap Trust & Custom Tap

```typescript
install("brew", {
  formula: "borders",
  tap: "FelixKratz/formulae",
  trust: true, // Automatically trusts "FelixKratz/formulae" before tapping
});
```

### Background Service & Keg-Only Linking

```typescript
install("brew", {
  formula: "redis",
  service: "start",
  link: { overwrite: true },
});
```

### Build Flags

```typescript
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
