# Homebrew Installation

Install tools using Homebrew package manager on macOS and Linux.

## Basic Usage

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install) => install('brew', { formula: 'ripgrep' }).bin('rg'));
```

## Parameters

| Parameter      | Description                                         |
| -------------- | --------------------------------------------------- |
| `formula`      | Formula or cask name (defaults to tool name)        |
| `cask`         | Set `true` for cask installation                    |
| `tap`          | Tap(s) to add before installing                     |
| `versionArgs`  | Arguments for version check (e.g., `['--version']`) |
| `versionRegex` | Regex to extract version from output                |

## Examples

### Homebrew Cask

```typescript
install('brew', {
  formula: 'visual-studio-code',
  cask: true,
}).bin('code');
```

### With Custom Tap

```typescript
install('brew', {
  formula: 'aerospace',
  cask: true,
  tap: 'nikitabobko/tap',
}).bin('aerospace');
```

### Multiple Taps

```typescript
install('brew', {
  formula: 'custom-tool',
  tap: ['custom/tap', 'another/tap'],
}).bin('custom-tool');
```

## Platform Support

| Platform | Support                 |
| -------- | ----------------------- |
| macOS    | Full (formulas + casks) |
| Linux    | Formulas only           |
| Windows  | Not supported           |

## Next Steps

- [GitHub Release](./github-release.md) - Cross-platform alternative
- [Platform Support](../platform-support.md) - Platform-specific configurations
