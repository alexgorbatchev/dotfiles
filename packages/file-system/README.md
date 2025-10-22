# @dotfiles/file-system

File system abstraction layer for the dotfiles generator.

## Features

- Platform-agnostic file system operations
- Memory-based file system for testing
- Consistent error handling
- Type-safe APIs

## Usage

```typescript
import { IFileSystem, NodeFileSystem, MemFileSystem } from '@dotfiles/file-system';

// Production usage
const fs: IFileSystem = new NodeFileSystem();
await fs.writeFile('/path/to/file', 'content');

// Testing usage
const fs: IFileSystem = new MemFileSystem();
await fs.writeFile('/test/file', 'content');
```
