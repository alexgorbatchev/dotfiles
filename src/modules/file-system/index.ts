/**
 * @file src/modules/file-system/index.ts
 * @description Barrel file for the File System Abstraction module.
 *
 * This module will provide an interface for file system operations and
 * implementations for both the real file system (using node:fs) and
 * a virtual file system (e.g., using memfs for testing).
 */

export * from './IFileSystem';
export * from './NodeFileSystem';
export * from './MemFileSystem';
