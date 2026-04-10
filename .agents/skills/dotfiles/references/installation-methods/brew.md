# Homebrew

Install tools using Homebrew package manager on macOS and Linux.

Shims are not supported for Homebrew-installed tools. The `.bin()` method should not be used with this installer. Homebrew manages binary placement and PATH integration natively.

## Basic Usage

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) => install("brew", { formula: "ripgrep" }));
```

## Parameters

| Parameter      | Description                                                 |
| -------------- | ----------------------------------------------------------- |
| `formula`      | Formula or cask name (defaults to tool name)                |
| `cask`         | Set `true` for cask installation                            |
| `tap`          | Tap(s) to add before installing                             |
| `versionArgs`  | Arguments for version check (e.g., `['--version']`)         |
| `versionRegex` | Regex to extract version from output (`string` or `RegExp`) |
| `env`          | Environment variables (static or dynamic function)          |

## Examples

### Homebrew Cask

```typescript
install("brew", {
  formula: "visual-studio-code",
  cask: true,
});
```

### With Custom Tap

```typescript
install("brew", {
  formula: "aerospace",
  cask: true,
  tap: "nikitabobko/tap",
});
```

### Multiple Taps

```typescript
install("brew", {
  formula: "custom-tool",
  tap: ["custom/tap", "another/tap"],
});
```

## Platform Support

| Platform | Support                 |
| -------- | ----------------------- |
| macOS    | Full (formulas + casks) |
| Linux    | Formulas only           |
| Windows  | Not supported           |
