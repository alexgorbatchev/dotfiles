# @dotfiles/generator-orchestrator

Orchestrates the generation of all dotfiles artifacts including shell initialization scripts, executable shims, and symbolic links. Coordinates multiple generators and manages the complete generation workflow.

## Overview

The generator orchestrator is the central coordinator for all generation tasks in the dotfiles system. It manages the execution of shell init generation, shim generation, and symlink generation in the correct order with proper error handling.

## Features

- **Multi-Generator Coordination**: Orchestrates shell-init, shim, and symlink generators
- **Dependency Management**: Ensures generators run in correct order
- **Progress Tracking**: Reports progress across all generation tasks
- **Error Handling**: Gracefully handles failures and provides detailed error messages
- **Artifact Manifest**: Produces a manifest of all generated files
- **Idempotent**: Safe to run multiple times

## API

### `GeneratorOrchestrator`

Main class for coordinating generation tasks.

```typescript
import { GeneratorOrchestrator } from '@dotfiles/generator-orchestrator';

const orchestrator = new GeneratorOrchestrator(
  logger,
  shellInitGenerator,
  shimGenerator,
  symlinkGenerator
);

const manifest = await orchestrator.generate(config, toolRegistry);
```

### `IGeneratorOrchestrator`

Interface for generation orchestration.

```typescript
interface IGeneratorOrchestrator {
  generate(
    config: ProjectConfig,
    toolRegistry: IToolRegistry
  ): Promise<GeneratedArtifactsManifest>;
}
```

## Generated Artifacts Manifest

The manifest contains information about all generated files:

```typescript
interface GeneratedArtifactsManifest {
  shellInit: {
    files: string[];
    timestamp: Date;
  };
  shims: {
    files: string[];
    timestamp: Date;
  };
  symlinks: {
    files: string[];
    timestamp: Date;
  };
}
```

## Usage Examples

### Basic Generation

```typescript
import { GeneratorOrchestrator } from '@dotfiles/generator-orchestrator';

const orchestrator = new GeneratorOrchestrator(
  logger,
  shellInitGenerator,
  shimGenerator,
  symlinkGenerator
);

const manifest = await orchestrator.generate(config, toolRegistry);

console.log('Generated files:');
console.log('  Shell init:', manifest.shellInit.files.length);
console.log('  Shims:', manifest.shims.files.length);
console.log('  Symlinks:', manifest.symlinks.files.length);
```

### With Error Handling

```typescript
try {
  const manifest = await orchestrator.generate(config, toolRegistry);
  logger.info('Generation completed successfully');
} catch (error) {
  logger.error('Generation failed', error);
  // Cleanup partial artifacts if needed
}
```

## Generation Workflow

The orchestrator executes generators in this order:

1. **Shell Init Generation**: Creates shell initialization scripts
2. **Shim Generation**: Creates executable shims for installed tools
3. **Symlink Generation**: Creates symbolic links for configuration files

This order ensures that:
- Shell scripts are available before shims need them
- Shims are created before symlinks reference them
- Dependencies are satisfied

## Dependencies

### Internal Dependencies
- `@dotfiles/config` - Configuration management
- `@dotfiles/file-system` - Filesystem operations
- `@dotfiles/logger` - Structured logging
- `@dotfiles/schemas` - Type definitions
- `@dotfiles/shell-init-generator` - Shell initialization generation
- `@dotfiles/shim-generator` - Shim generation
- `@dotfiles/symlink-generator` - Symlink generation

## Testing

Run tests with:
```bash
bun test packages/generator-orchestrator
```

## Design Decisions

### Why Orchestrator Pattern?
The orchestrator pattern:
- Centralizes coordination logic
- Manages dependencies between generators
- Provides single point of control
- Simplifies error handling

### Why Manifest Output?
Returning a manifest:
- Tracks all generated files
- Enables cleanup operations
- Supports verification
- Aids debugging
