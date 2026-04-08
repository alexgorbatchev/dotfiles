import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

// Omit 'toBeEmpty' from jest-dom matchers because it conflicts with Bun's built-in toBeEmpty
// Bun's toBeEmpty: works on strings, arrays, objects, sets
// jest-dom's toBeEmpty: works on DOM elements (deprecated in favor of toBeEmptyDOMElement)
type SafeTestingLibraryMatchers<E, R> = Omit<TestingLibraryMatchers<E, R>, "toBeEmpty">;

declare module "bun:test" {
  interface Matchers<T = unknown> extends SafeTestingLibraryMatchers<typeof expect.stringContaining, T> {}
}
