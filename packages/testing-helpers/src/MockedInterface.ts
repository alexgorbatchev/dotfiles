import type { Mock } from 'bun:test';

/**
 * Creates a strongly typed mock interface that preserves method signatures
 * while adding mock functionality.
 */
export type MockedInterface<T> = {
  // biome-ignore lint/suspicious/noExplicitAny: Generic type constraint requires any for function signature matching
  [K in keyof T]: T[K] extends (...args: any[]) => any ? Mock<T[K]> : T[K];
};
