import type { Mock } from "bun:test";

/**
 * Creates a strongly typed mock interface that preserves method signatures
 * while adding mock functionality.
 */
export type MockedInterface<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R ? Mock<(...args: A) => R> : T[K];
};
