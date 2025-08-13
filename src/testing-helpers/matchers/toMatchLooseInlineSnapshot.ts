import { expect } from 'bun:test';
import { dedentString } from '@utils';

declare module 'bun:test' {
  interface Matchers<T> {
    toMatchLooseInlineSnapshot(strings: TemplateStringsArray, ...matchers: unknown[]): T;
  }
}

function escapeRegexLiteral(value: unknown): string {
  return String(value).replace(/[-/\\^$*+?.()|[\]{}]/gm, '\\$&');
}

expect.extend({
  toMatchLooseInlineSnapshot(this: unknown, received: unknown, strings: TemplateStringsArray, ...matchers: unknown[]) {
    if (typeof received !== 'string') {
      return {
        pass: false,
        message: () => `Expected a string, but received ${typeof received}.`,
      };
    }

    let pattern = '';

    for (let i = 0; i < strings.length; i++) {
      const str = strings[i];
      if (str !== undefined) {
        pattern += escapeRegexLiteral(str);
      }

      if (i < matchers.length) {
        const matcher = matchers[i];

        if (matcher === expect.anything) {
          pattern += '.*?';
        } else if (matcher instanceof RegExp) {
          pattern += matcher.source;
        } else if (typeof matcher === 'function') {
          pattern += '.*?';
        } else {
          pattern += escapeRegexLiteral(matcher);
        }
      }
    }

    const dedentedPattern = dedentString(pattern);
    const fullRegex = `^${dedentedPattern}$`;

    try {
      const re = new RegExp(fullRegex, 'sm');
      const pass = re.test(received);

      return {
        pass,
        message: () =>
          pass
            ? `Expected string not to match pattern, but it did.\nPattern:\n${fullRegex}`
            : `Expected string to match pattern, but it didn’t.\nPattern:\n${fullRegex}\n\nReceived:\n${received}`,
      };
    } catch (error) {
      return {
        pass: false,
        message: () => `Invalid regex: ${(error as Error).message}\n\nPattern:\n${fullRegex}`,
      };
    }
  },
});
