# API Reference

Reference for the public API available in `@gitea/dotfiles`.

## Exports

```typescript
import { 
  defineTool,      // Create tool configurations
  defineConfig,    // Create project configuration
  Platform,        // Platform enum for cross-platform configs
  Architecture,    // Architecture enum
  replaceInFile,   // Utility for file modifications
  dedentString,    // Utility for template strings
  dedentTemplate,  // Tagged template for dedenting
} from '@gitea/dotfiles';
```

## defineTool

Creates a tool configuration.

```typescript
export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
);
```

### Parameters

- `install(method, params)` - Function to select installation method
- `ctx` - Context object with `projectConfig`, `toolName`, `systemInfo`

### Builder Methods

| Method | Description |
|--------|-------------|
| `.bin(name)` | Define binary name(s) to expose |
| `.version(v)` | Set version (`'latest'` or specific) |
| `.dependsOn(...bins)` | Declare binary dependencies |
| `.symlink(src, dest)` | Create config file symlink |
| `.hook(event, fn)` | Lifecycle hooks ([details](./hooks.md)) |
| `.zsh(fn)` | Zsh shell configuration |
| `.bash(fn)` | Bash shell configuration |
| `.powershell(fn)` | PowerShell configuration |
| `.platform(p, fn)` | Platform-specific overrides |

### Shell Configuration

The shell methods (`.zsh`, `.bash`, `.powershell`) receive a configurator:

```typescript
.zsh((shell) =>
  shell
    .completions('completions/_tool')
    .environment({ VAR: 'value' })
    .aliases({ t: 'tool' })
    .always(/* zsh */`
      function my-func() { tool "$@"; }
    `)
)
```

| Shell Method | Description |
|--------------|-------------|
| `.completions(path)` | Path to completion file |
| `.environment(obj)` | Environment variables |
| `.aliases(obj)` | Shell aliases |
| `.always(script)` | Script run on every shell init |
| `.once(script)` | Script run once after install |

## defineConfig

Creates project configuration. See [Project Configuration](./config.md).

```typescript
export default defineConfig(() => ({
  paths: { dotfilesDir: '~/.dotfiles' },
}));
```

## Platform

Enum for platform-specific configurations.

```typescript
import { defineTool, Platform } from '@gitea/dotfiles';

export default defineTool((install) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .platform(Platform.MacOS, (install) =>
      install('brew', { formula: 'tool' })
    )
);
```

| Value | Description |
|-------|-------------|
| `Platform.Linux` | Linux systems |
| `Platform.MacOS` | macOS (alias: `Platform.Darwin`) |
| `Platform.Windows` | Windows systems |

## Architecture

Enum for architecture-specific configurations.

| Value | Description |
|-------|-------------|
| `Architecture.X86_64` | Intel/AMD 64-bit |
| `Architecture.Arm64` | ARM 64-bit (Apple Silicon, etc.) |

## Utilities

### replaceInFile

Replace text in files during hooks.

```typescript
import { replaceInFile } from '@gitea/dotfiles';

.hook('after-extract', async (ctx) => {
  await replaceInFile(ctx.fileSystem, 'path/to/file', 'old', 'new');
})
```

### dedentTemplate

Tagged template for removing indentation from multi-line strings.

```typescript
import { dedentTemplate } from '@gitea/dotfiles';

const script = dedentTemplate`
  if [[ -n "$VAR" ]]; then
    echo "Hello"
  fi
`;
```

## Installation Method Parameters

See [Installation Methods](./installation/README.md) for detailed parameters for each method:

- `github-release` - [GitHub Releases](./installation/github-release.md)
- `brew` - [Homebrew](./installation/homebrew.md)
- `cargo` - [Cargo](./installation/cargo.md)
- `curl-script` - [Curl Scripts](./installation/curl-script.md)
- `curl-tar` - [Curl Tar](./installation/curl-tar.md)
- `manual` - [Manual](./installation/manual.md)