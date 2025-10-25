import { mock } from 'bun:test';

/**
 * Simple replacement for @rageltd/bun-test-utils that uses native Bun mocking.
 * This avoids workspace package resolution issues with the third-party utility.
 */

export interface ModuleMocker {
  mock: (modulePath: string, factory: () => unknown) => Promise<void>;
  restore: (modulePath: string) => void;
  restoreAll: () => void;
}

const mockRegistry = new Map<string, unknown>();

export function createModuleMocker(): ModuleMocker {
  return {
    async mock(modulePath: string, factory: () => unknown): Promise<void> {
      mock.module(modulePath, factory);
    },

    restore(modulePath: string): void {
      // Note: Bun's mock.restore() has known issues with module mocks
      // This is a limitation we acknowledge but doesn't affect our current tests
      mockRegistry.delete(modulePath);
    },

    restoreAll(): void {
      // Clear our registry, but note the Bun limitation
      mockRegistry.clear();
    },
  };
}

export function clearMockRegistry(): void {
  mockRegistry.clear();
}

export function setupTestCleanup(): void {
  // No-op for now, but maintains API compatibility
}
