# Homebrew Installation

The `brew` method installs tools using Homebrew package manager on macOS and Linux.

## Basic Usage

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('brew', {
    formula: 'package-name',
  })
    .bin('package-name')
);
```

## Parameters

The `install('brew', params)` function accepts:

```typescript
{
  formula?: 'package-name',     // Optional (defaults to tool name)
  cask?: boolean,              // Optional
  tap?: 'tap-name' | string[], // Optional
  env?: { KEY: 'value' },      // Optional
  hooks?: {                    // Optional
    beforeInstall?: async (ctx) => void,
    afterInstall?: async (ctx) => void,
  }
}
```

### Parameters

- **`formula`**: Homebrew formula or cask name
- **`cask`**: Set to `true` to install as a cask
- **`tap`**: Required tap(s) to add before installing
- **`versionArgs`**: Arguments to pass to the binary to check the version (e.g. `['--version']`).
- **`versionRegex`**: Regex to extract version from output (e.g. `version (\d+\.\d+\.\d+)`).

## Examples

### Simple Brew Formula

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('brew', {
    formula: 'ripgrep',
  })
    .bin('rg')
);
```

### Homebrew Cask

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('brew', {
    formula: 'visual-studio-code',
    cask: true,
  })
    .bin('code')
);
```

### With Custom Tap

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('brew', {
    formula: 'aerospace',
    cask: true,
    tap: 'nikitabobko/tap',
  })
    .bin('aerospace')
);
```

### Multiple Taps

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('brew', {
    formula: 'custom-tool',
    tap: ['custom/tap', 'another/tap'],
  })
    .bin('custom-tool')
);
```

## When to Use Homebrew

**Advantages:**
- Simple and reliable
- Well-maintained packages
- Automatic dependency management
- Native integration with macOS and Linux
- **Version tracking**: Automatically records the installed version in the tool registry

**Disadvantages:**
- Platform-specific (macOS/Linux only)
- Requires Homebrew to be installed
- May not have the latest versions immediately

## Version Tracking

The installer automatically fetches and records the installed version using `brew info --json`. This enables:
- Version upgrade detection
- Tracking of installed tool versions
- Registry-based tool management

If version fetching fails (e.g., formula not found), the installation still succeeds but the version will not be recorded in the registry.

## Platform Support

Homebrew installation works on:
- **macOS**: Full support for formulas and casks
- **Linux**: Formula support (casks not available)
- **Windows**: Not supported

## Next Steps

- [GitHub Release Installation](./github-release.md) - Cross-platform alternative
- [Cargo Installation](./cargo.md) - For Rust tools
- [Platform Support](../platform-support.md) - Configure platform-specific installations