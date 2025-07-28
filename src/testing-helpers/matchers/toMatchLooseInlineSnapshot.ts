import { expect } from 'bun:test';

declare module 'bun:test' {
  interface Matchers<T> {
    toMatchLooseInlineSnapshot(strings: TemplateStringsArray, ...matchers: any[]): T;
  }
}

function escapeRegexLiteral(value: any): string {
  return String(value).replace(/[-/\\^$*+?.()|[\]{}]/gm, '\\$&');
}

function stripIndentFromPattern(pattern: string): string {
  const lines = pattern.split('\n');
  const nonEmpty = lines.filter((line) => line.trim().length > 0);
  const minIndent = nonEmpty.length
    ? Math.min(...nonEmpty.map((line) => line.match(/^ */)![0].length))
    : 0;
  return lines.map((line) => line.slice(minIndent)).join('\n');
}

expect.extend({
  toMatchLooseInlineSnapshot(
    this: any,
    received: unknown,
    strings: TemplateStringsArray,
    ...matchers: any[]
  ) {
    if (typeof received !== 'string') {
      return {
        pass: false,
        message: () => `Expected a string, but received ${typeof received}.`,
      };
    }

    let pattern = '';

    for (let i = 0; i < strings.length; i++) {
      pattern += escapeRegexLiteral(strings[i]!);

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

    const dedentedPattern = stripIndentFromPattern(pattern).trim();
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
    } catch (err) {
      return {
        pass: false,
        message: () => `Invalid regex: ${(err as Error).message}\n\nPattern:\n${fullRegex}`,
      };
    }
  },
});
