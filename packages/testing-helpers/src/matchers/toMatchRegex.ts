import { expect } from "bun:test";

declare module "bun:test" {
  interface IMatchRegexMatchers<T> {
    /**
     * Asserts that a single-line string matches a regex pattern.
     *
     * This matcher enforces single-line input to ensure proper context capture.
     * For multi-line strings, use `toMatchLooseInlineSnapshot` instead.
     *
     * @param pattern - The regex pattern to match against
     *
     * @example
     * expect('hello world').toMatchRegex(/hello/);
     * expect('version 1.2.3').toMatchRegex(/\d+\.\d+\.\d+/);
     *
     * @throws If the input string contains newlines - use toMatchLooseInlineSnapshot instead
     */
    toMatchRegex(pattern: RegExp): T;
  }

  interface Matchers<T> extends IMatchRegexMatchers<T> {}
}

expect.extend({
  toMatchRegex(this: unknown, received: unknown, pattern: RegExp) {
    if (typeof received !== "string") {
      return {
        pass: false,
        message: () => `Expected a string, but received ${typeof received}.`,
      };
    }

    if (received.includes("\n")) {
      return {
        pass: false,
        message: () => `Input contains newlines. Use 'toMatchLooseInlineSnapshot' instead for multi-line content.`,
      };
    }

    const pass = pattern.test(received);

    return {
      pass,
      message: () =>
        pass
          ? `Expected string not to match pattern ${pattern}, but it did.\nReceived: ${received}`
          : `Expected string to match pattern ${pattern}, but it didn't.\nReceived: ${received}`,
    };
  },
});
