# Path Resolution Audit for `defineTool()`

This document describes how relative paths are resolved when absolute paths are not specified in `defineTool()` API methods.

## Context Properties Available to Users

The `IToolConfigContext` (passed as `ctx` in `defineTool`) provides:

| Property | Description | Derived From |
|----------|-------------|--------------|
| `toolDir` | Directory containing the `.tool.ts` file | `path.dirname(filePath)` |
| `currentDir` | Stable symlink path after install | `${projectConfig.paths.binariesDir}/${toolName}/current` |
| `projectConfig.paths.*` | All configured paths | User's config.yaml |

---

## Path Resolution by API Method

### 1. Shell `.source(path)`

**File**: `packages/tool-config-builder/src/ShellConfigurator.ts`

**Resolution Logic**:
```
1. If absolute path → use as-is
2. If relative path → resolve against: ${projectConfig.paths.binariesDir}/${toolName}
```

**Implementation**:
```typescript
const toolBinariesDir = path.join(this.context.projectConfig.paths.binariesDir, this.context.toolName);
const joinedPath = path.join(toolBinariesDir, trimmedPath);
```

**Example**:
```typescript
// If toolName = 'fzf' and binariesDir = '/home/user/.dotfiles/.generated/binaries'
shell.source('current/shell/key-bindings.zsh')
// Resolves to: /home/user/.dotfiles/.generated/binaries/fzf/current/shell/key-bindings.zsh
```

---

### 2. Symlink `symlink(source, target)`

**File**: `packages/symlink-generator/src/SymlinkGenerator.ts` using `packages/utils/src/expandToolConfigPath.ts`

**Resolution Logic** (for both `source` and `target`):
```
1. Expand variables: ${paths.homeDir}, ${paths.dotfilesDir}, etc.
2. Expand ~ to projectConfig.paths.homeDir
3. If relative path:
   - If configFilePath exists → resolve against path.dirname(configFilePath) (toolDir)
   - Else fallback → resolve against projectConfig.paths.dotfilesDir
```

**Example**:
```typescript
// If tool config is at /home/user/.dotfiles/tools/lazygit/lazygit.tool.ts
symlink('./config.yml', '~/.config/lazygit/config.yml')
// source resolves to: /home/user/.dotfiles/tools/lazygit/config.yml
// target resolves to: /home/user/.config/lazygit/config.yml
```

---

### 3. Completions `.completions(config)`

**File**: `packages/shell-init-generator/src/completion-generator/CompletionGenerator.ts`

**Resolution Logic** (for `source` property):
```
1. If contains glob patterns (*, ?, []) → search in toolInstallDir
2. First, try: ${toolInstallDir}/${source}
3. If not found AND configFilePath exists → try: ${configDir}/${source}
```

Where `toolInstallDir` = `${projectConfig.paths.binariesDir}/${toolName}/current`

**Example**:
```typescript
// Static source - checks installed dir first, then config dir
shell.completions('completions/_fzf')
// First tries: ${binariesDir}/fzf/current/completions/_fzf
// Fallback: ${toolDir}/completions/_fzf

// With callback
shell.completions((ctx) => ({ source: 'completions/_fzf' }))
```

---

### 4. Manual Installer `binaryPath`

**File**: `packages/installer-manual/src/installManually.ts`

**Resolution Logic**: Uses `expandToolConfigPath()` - same as symlinks.

```
1. Expand variables and ~
2. If relative → resolve against toolDir (config file directory)
```

**Example**:
```typescript
install('manual', { binaryPath: './bin/my-tool' })
// Resolves to: ${toolDir}/bin/my-tool
```

---

### 5. Binary Pattern `bin(name, pattern)`

**File**: `packages/tool-config-builder/src/toolConfigBuilder.ts`

**Default pattern**: `*/${name}`

**Resolution**: Patterns are resolved against `installedDir` at install time by the binary discovery utilities.

**Example**:
```typescript
bin('rg', '*/rg')
// At install time, searches for 'rg' in: ${installedDir}/**/rg
```

---

### 6. `ctx.replaceInFile(path, ...)`

**No automatic resolution** - paths are passed directly to the file system. Users must provide absolute paths or use context properties.

**Example**:
```typescript
ctx.replaceInFile(`${ctx.currentDir}/config.toml`, /pattern/, 'replacement')
```

---

## Summary Table

| API Method | Relative Path Resolution Base |
|------------|------------------------------|
| `shell.source(path)` | `${binariesDir}/${toolName}` |
| `symlink(source, target)` | `toolDir` (config file directory) |
| `completions({ source })` | `${binariesDir}/${toolName}/current` → fallback `toolDir` |
| `manual({ binaryPath })` | `toolDir` (config file directory) |
| `bin(name, pattern)` | `installedDir` (at install time) |
| `ctx.replaceInFile(path)` | No resolution - absolute paths required |

---

## ⚠️ Inconsistency Warning

**Shell `.source()` resolves differently than symlinks and manual installer:**

| Method | Resolves relative paths against |
|--------|--------------------------------|
| `symlink()` | `toolDir` (config file directory) |
| `shell.source()` | `${binariesDir}/${toolName}` |

This means a file at `./shell/init.zsh` next to your tool config:

- **symlink**: Would resolve to `${toolDir}/shell/init.zsh` ✓
- **shell.source**: Would resolve to `${binariesDir}/${toolName}/shell/init.zsh` ✗ (different!)

### Recommended Pattern for shell.source()

Since `shell.source()` resolves against the binaries directory, use paths that reference installed files:

```typescript
// For files installed WITH the tool (in currentDir):
shell.source('current/shell/init.zsh')

// For files next to your .tool.ts config, use absolute path:
shell.source(`${ctx.toolDir}/shell/init.zsh`)
```

---

## Hook Contexts

Different hook contexts provide different path properties:

| Hook | Available Paths |
|------|-----------------|
| `before-install` | `stagingDir` (UUID-based temp directory) |
| `after-download` | `stagingDir`, `downloadPath` |
| `after-extract` | `stagingDir`, `downloadPath`, `extractDir` |
| `after-install` | `installedDir`, `binaryPaths[]` |

**Note**: `stagingDir` is temporary and may be renamed/deleted. Use `installedDir` (only in `after-install`) for the final installation location.
