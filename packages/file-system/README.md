# @dotfiles/file-system

The `@dotfiles/file-system` package provides a flexible and testable abstraction for file system operations. It defines a standard `IFileSystem` interface and offers two primary implementations: `NodeFileSystem` for interacting with the real file system and `MemFileSystem` for in-memory operations, ideal for testing.

## Core Components

### `IFileSystem`

An interface that defines a standard contract for file system operations, such as reading, writing, and deleting files and directories. All file system interactions in the application should be typed against `IFileSystem` to allow for dependency injection and easy testing.

### `NodeFileSystem`

A concrete implementation of `IFileSystem` that uses the Node.js `fs` module. This is the standard implementation for production use, providing a thin, object-oriented wrapper around `fs.promises`.

### `MemFileSystem`

An in-memory implementation of `IFileSystem` using `memfs`. It's designed for testing and dry-run scenarios, allowing file operations to be performed in a virtual file system without affecting the disk.

## Usage

### Production Usage with `NodeFileSystem`

In your application's entry point, inject `NodeFileSystem` wherever `IFileSystem` is required.

```typescript
import { type IFileSystem, NodeFileSystem } from '@dotfiles/file-system';

const fs: IFileSystem = new NodeFileSystem();

async function main() {
  await fs.writeFile('example.txt', 'Hello, world!');
  const content = await fs.readFile('example.txt');
  console.log(content); // 'Hello, world!'
  await fs.rm('example.txt');
}

main();
```

### Testing with `MemFileSystem`

In tests, use `MemFileSystem` to create a sandboxed file system. You can initialize it with a predefined directory structure.

```typescript
import { type IFileSystem, MemFileSystem } from '@dotfiles/file-system';

// Initialize with a file
const fs: IFileSystem = new MemFileSystem({
  '/home/user/data.txt': 'Initial data',
});

async function test() {
  const content = await fs.readFile('/home/user/data.txt');
  expect(content).toBe('Initial data');

  await fs.writeFile('/home/user/new-file.txt', 'New content');
  const exists = await fs.exists('/home/user/new-file.txt');
  expect(exists).toBe(true);
}

test();
```

For more advanced testing scenarios, this package also exports a `createMemFileSystem` factory function that simplifies creating and spying on `MemFileSystem` instances.
