/**
 * @fileoverview Provides test helpers for file system operations,
 * specifically for creating mock IFileSystem instances.
 *
 * ## Development Plan
 *
 * ### Overview
 * This file provides a helper function `createMockFileSystem` to easily create
 * `MemFileSystem` instances for testing, with an option to initialize the
 * file system with a predefined JSON structure.
 *
 * ### Technical Requirements
 * - The `createMockFileSystem` function should:
 *   - Accept an optional `initialVolumeJson` parameter (DirectoryJSON from 'memfs').
 *   - Instantiate and return a new `MemFileSystem`.
 *   - If `initialVolumeJson` is provided, use it to initialize the `MemFileSystem`'s volume.
 *   - If `initialVolumeJson` is not provided, initialize with an empty volume.
 * - Adhere to all project coding standards and `.roorules`.
 *
 * ### Tasks
 * - [x] Define `createMockFileSystem` function signature.
 * - [x] Implement `MemFileSystem` instantiation.
 * - [x] Implement logic to use `initialVolumeJson` if provided.
 * - [x] Cleanup all linting errors and warnings.
 * - [x] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [x] Ensure 100% test coverage for executable code. (N/A)
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */
import { MemFileSystem, type IFileSystem } from '@modules/file-system';
import type { DirectoryJSON } from 'memfs';

/**
 * Creates a mock `IFileSystem` instance using `MemFileSystem`.
 *
 * @param initialVolumeJson - Optional JSON object (memfs DirectoryJSON) to initialize the file system volume.
 *                            Keys are file paths, values are file content (string, Buffer) or null for directories.
 * @returns A new `MemFileSystem` instance.
 */
export function createMemFileSystem(initialVolumeJson?: DirectoryJSON): IFileSystem {
  if (initialVolumeJson) {
    // MemFileSystem constructor can take DirectoryJSON directly
    return new MemFileSystem(initialVolumeJson);
  }
  return new MemFileSystem();
}
