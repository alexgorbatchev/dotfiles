import { mock } from 'bun:test';
import type { IFileRegistry } from '@dotfiles/registry/file';

export function createMockFileRegistry(): IFileRegistry {
  return {
    recordOperation: mock(async () => {}),
    getOperations: mock(async () => []),
    getFileStatesForTool: mock(async () => []),
    getFileState: mock(async () => null),
    getRegisteredTools: mock(async () => []),
    removeToolOperations: mock(async () => {}),
    compact: mock(async () => {}),
    validate: mock(async () => ({ valid: true, issues: [], repaired: [] })),
    getStats: mock(async () => ({
      totalOperations: 0,
      totalFiles: 0,
      totalTools: 0,
      oldestOperation: 0,
      newestOperation: 0,
    })),
    close: mock(async () => {}),
  };
}
