# @dotfiles/symlink-generator

Generates symbolic links for configuration files. Creates and manages symlinks that connect tool configuration files to their expected locations in the user's home directory or system directories.

## Overview

The symlink-generator automates the creation of symbolic links for configuration files. It ensures that configuration files stored in the dotfiles repository are properly linked to their expected locations, making them accessible to installed tools.

## Features

- **Declarative Configuration**: Define symlinks in YAML configuration
- **Automatic Creation**: Creates symlinks based on configuration
- **Parent Directory Creation**: Automatically creates parent directories
- **Conflict Detection**: Detects and handles existing files
- **Backup Support**: Can backup existing files before linking
- **Registry Integration**: Tracks created symlinks for cleanup

## API

### `SymlinkGenerator`

Main class for generating symlinks.

```typescript
import { SymlinkGenerator } from '@dotfiles/symlink-generator';

const generator = new SymlinkGenerator(logger, fileSystem, config, toolRegistry);

const symlinkPaths = await generator.generate();
```

### `ISymlinkGenerator`

Interface for symlink generation.

```typescript
interface ISymlinkGenerator {
  generate(): Promise<string[]>;
}
```

## Usage Examples

### Basic Generation

```typescript
import { SymlinkGenerator } from '@dotfiles/symlink-generator';

const generator = new SymlinkGenerator(logger, fileSystem, config, toolRegistry);

// Generate all configured symlinks
const symlinkPaths = await generator.generate();

console.log('Created symlinks:', symlinkPaths);
// [
//   '~/.gitconfig',
//   '~/.vimrc',
//   '~/.zshrc',
// ]
```

### With Configuration

```typescript
const config = {
  symlinks: [
    {
      source: '~/.dotfiles/configs/git/.gitconfig',
      target: '~/.gitconfig',
    },
    {
      source: '~/.dotfiles/configs/vim/.vimrc',
      target: '~/.vimrc',
    },
  ],
  // ...
};

const generator = new SymlinkGenerator(logger, fileSystem, config, toolRegistry);

await generator.generate();
```

## Configuration

### Symlink Configuration in config.yaml

```yaml
symlinks:
  # Git configuration
  - source: ~/.dotfiles/configs/git/.gitconfig
    target: ~/.gitconfig

  # Vim configuration
  - source: ~/.dotfiles/configs/vim/.vimrc
    target: ~/.vimrc

  # Zsh configuration
  - source: ~/.dotfiles/configs/zsh/.zshrc
    target: ~/.zshrc

  # SSH configuration
  - source: ~/.dotfiles/configs/ssh/config
    target: ~/.ssh/config

  # Tool-specific configs
  - source: ~/.dotfiles/configs/bat/config
    target: ~/.config/bat/config

# Symlink options
symlinkOptions:
  backup: true
  force: false
  createParentDirs: true
```

## Symlink Operations

### Creating Symlinks

```typescript
// Create symlink
await fileSystem.symlink(sourcePath, targetPath);

// Verify symlink
const isSymlink = await fileSystem.isSymlink(targetPath);
const linkTarget = await fileSystem.readlink(targetPath);
```

### Handling Conflicts

```typescript
// Check if target exists
const targetExists = await fileSystem.exists(targetPath);

if (targetExists) {
  // Backup existing file
  await fileSystem.copy(targetPath, `${targetPath}.backup`);

  // Remove old file
  await fileSystem.remove(targetPath);
}

// Create symlink
await fileSystem.symlink(sourcePath, targetPath);
```

## Integration with Registry

The generator tracks created symlinks in the registry:

```typescript
// Symlinks are tracked per tool
await toolRegistry.addSymlink('git', '~/.gitconfig');

// Query symlinks
const symlinks = await toolRegistry.getSymlinks('git');
console.log(symlinks);
// ['~/.gitconfig']

// Remove symlinks on cleanup
const symlinks = await toolRegistry.getSymlinks('git');
for (const symlink of symlinks) {
  await fileSystem.remove(symlink);
  await toolRegistry.removeSymlink('git', symlink);
}
```

## Common Patterns

### Git Configuration

```yaml
symlinks:
  - source: ~/.dotfiles/configs/git/.gitconfig
    target: ~/.gitconfig
  - source: ~/.dotfiles/configs/git/.gitignore_global
    target: ~/.gitignore_global
```

### Shell Configuration

```yaml
symlinks:
  - source: ~/.dotfiles/configs/zsh/.zshrc
    target: ~/.zshrc
  - source: ~/.dotfiles/configs/bash/.bashrc
    target: ~/.bashrc
```

### XDG Base Directory

```yaml
symlinks:
  # Follow XDG Base Directory specification
  - source: ~/.dotfiles/configs/bat/config
    target: ~/.config/bat/config
  - source: ~/.dotfiles/configs/alacritty/alacritty.yml
    target: ~/.config/alacritty/alacritty.yml
```

### SSH Configuration

```yaml
symlinks:
  - source: ~/.dotfiles/configs/ssh/config
    target: ~/.ssh/config
  - source: ~/.dotfiles/configs/ssh/authorized_keys
    target: ~/.ssh/authorized_keys
```

## Dependencies

### Internal Dependencies

- `@dotfiles/config` - Configuration management
- `@dotfiles/file-system` - Filesystem operations (symlink creation)
- `@dotfiles/logger` - Structured logging
- `@dotfiles/registry` - Symlink tracking
- `@dotfiles/schemas` - Type definitions
- `@dotfiles/utils` - Shared utilities

## Testing

Run tests with:

```bash
bun test packages/symlink-generator
```

The package includes tests for:

- Symlink creation
- Conflict handling
- Backup creation
- Parent directory creation
- Registry integration
- Error scenarios

## Error Handling

### Source Not Found

```typescript
Error: Symlink source not found
Source: ~/.dotfiles/configs/git/.gitconfig
Target: ~/.gitconfig
```

### Permission Denied

```typescript
Error: Failed to create symlink: Permission denied
Target: ~/.gitconfig
```

### Target Already Exists

```typescript
Error: Target already exists and backup is disabled
Target: ~/.gitconfig
Solution: Enable backup option or remove existing file
```

## Best Practices

### Always Use Absolute Paths

```typescript
// Resolve paths to absolute
const absoluteSource = await fileSystem.realpath(sourcePath);
const absoluteTarget = await fileSystem.realpath(targetPath);

await fileSystem.symlink(absoluteSource, absoluteTarget);
```

### Check Source Exists

```typescript
const sourceExists = await fileSystem.exists(sourcePath);

if (!sourceExists) {
  throw new Error(`Symlink source not found: ${sourcePath}`);
}
```

### Handle Existing Targets

```typescript
if (await fileSystem.exists(targetPath)) {
  if (options.backup) {
    // Create backup
    await fileSystem.copy(targetPath, `${targetPath}.backup`);
  }

  // Remove existing
  await fileSystem.remove(targetPath);
}
```

### Create Parent Directories

```typescript
const targetDir = path.dirname(targetPath);
await fileSystem.ensureDir(targetDir);
```

## Backup Strategy

### Automatic Backups

```typescript
// Backup existing files before creating symlinks
const backupPath = `${targetPath}.backup.${Date.now()}`;

if (await fileSystem.exists(targetPath)) {
  await fileSystem.copy(targetPath, backupPath);
  logger.info('Created backup', { original: targetPath, backup: backupPath });
}
```

### Backup Restoration

```typescript
// Restore from backup
const backups = await fileSystem.glob(`${targetPath}.backup.*`);

if (backups.length > 0) {
  const latestBackup = backups[backups.length - 1];
  await fileSystem.copy(latestBackup, targetPath);
}
```

## Design Decisions

### Why Symbolic Links?

Symbolic links:

- Keep files in version control
- Allow editing from either location
- Maintain single source of truth
- Support version control tracking

### Why Track in Registry?

Registry tracking:

- Enables cleanup on uninstall
- Supports conflict detection
- Allows restoration
- Aids debugging

### Why Support Backups?

Backups:

- Prevent data loss
- Allow rollback
- Build user confidence
- Support experimentation

## Symlink Validation

### Verify Symlink Integrity

```typescript
// Check if symlink is valid
const isSymlink = await fileSystem.isSymlink(targetPath);

if (isSymlink) {
  const linkTarget = await fileSystem.readlink(targetPath);
  const targetExists = await fileSystem.exists(linkTarget);

  if (!targetExists) {
    logger.warn('Broken symlink detected', {
      symlink: targetPath,
      target: linkTarget,
    });
  }
}
```

### Cleanup Broken Symlinks

```typescript
// Remove broken symlinks
const symlinks = await toolRegistry.getAllSymlinks();

for (const symlink of symlinks) {
  if (await fileSystem.isSymlink(symlink)) {
    const target = await fileSystem.readlink(symlink);
    const targetExists = await fileSystem.exists(target);

    if (!targetExists) {
      await fileSystem.remove(symlink);
      logger.info('Removed broken symlink', { symlink, target });
    }
  }
}
```

## Advanced Usage

### Conditional Symlinks

```typescript
// Create symlinks based on conditions
if (systemInfo.platform === 'darwin') {
  // macOS-specific symlinks
  await generator.createSymlink('~/.dotfiles/configs/macos/.skhdrc', '~/.skhdrc');
}
```

### Dynamic Symlinks

```typescript
// Generate symlinks for all config files
const configFiles = await fileSystem.glob('~/.dotfiles/configs/**/*');

for (const configFile of configFiles) {
  const relativePath = path.relative('~/.dotfiles/configs', configFile);
  const targetPath = path.join('~', relativePath);

  await generator.createSymlink(configFile, targetPath);
}
```

## Future Enhancements

Potential improvements:

- Symlink templates
- Conditional symlink creation
- Symlink groups
- Platform-specific symlinks
- Automated conflict resolution
- Symlink verification
- Restore from backup command
