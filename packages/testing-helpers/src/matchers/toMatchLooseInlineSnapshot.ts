import { dedentString } from '@dotfiles/utils';
import { expect } from 'bun:test';

declare module 'bun:test' {
  interface ILooseInlineSnapshotMatchers<T> {
    /**
     * Asserts that a string contains a pattern defined by a template literal.
     *
     * Features:
     * - **Substring matching**: Pattern can match anywhere in the string (no anchors)
     * - **Whitespace flexibility**: All whitespace (spaces, tabs, newlines) is normalized,
     *   so indentation differences don't cause failures
     * - **Auto-dedent**: Template literal is automatically dedented
     * - **Matchers**: Supports `expect.anything` and `RegExp` interpolations
     *
     * @example
     * // Basic substring match
     * expect('prefix hello world suffix').toMatchLooseInlineSnapshot`hello world`;
     *
     * @example
     * // Indentation-agnostic matching
     * const script = `
     *   function foo() {
     *     return 1;
     *   }
     * `;
     * expect(script).toMatchLooseInlineSnapshot`
     *   function foo() {
     *     return 1;
     *   }
     * `;
     *
     * @example
     * // With matchers
     * expect('version 1.2.3').toMatchLooseInlineSnapshot`version ${/\d+\.\d+\.\d+/}`;
     * expect('start middle end').toMatchLooseInlineSnapshot`start ${expect.anything} end`;
     */
    toMatchLooseInlineSnapshot(strings: TemplateStringsArray, ...matchers: unknown[]): T;
  }

  interface Matchers<T> extends ILooseInlineSnapshotMatchers<T> {}
}

function escapeRegexLiteral(value: unknown): string {
  return String(value).replace(/[-/\\^$*+?.()|[\]{}]/gm, '\\$&');
}

function makeWhitespaceFlexible(pattern: string): string {
  // Replace runs of whitespace with \s+ for loose matching
  return pattern.replace(/\s+/g, '\\s+');
}

function validateInput(
  received: unknown,
): { isValid: true; value: string; } | { isValid: false; result: { pass: false; message: () => string; }; } {
  if (typeof received !== 'string') {
    return {
      isValid: false,
      result: {
        pass: false,
        message: () => `Expected a string, but received ${typeof received}.`,
      },
    };
  }
  return { isValid: true, value: received };
}

function buildPattern(strings: TemplateStringsArray, matchers: unknown[]): string {
  let pattern = '';

  for (let i = 0; i < strings.length; i++) {
    const str = strings[i];
    if (str !== undefined) {
      pattern += escapeRegexLiteral(str);
    }

    if (i < matchers.length) {
      pattern += processMatcherAtIndex(matchers[i]);
    }
  }

  return pattern;
}

function processMatcherAtIndex(matcher: unknown): string {
  if (matcher === expect.anything) {
    return '.*?';
  }
  if (matcher instanceof RegExp) {
    return matcher.source;
  }
  if (typeof matcher === 'function') {
    return '.*?';
  }
  return escapeRegexLiteral(matcher);
}

function executeRegexMatch(fullRegex: string, received: string): { pass: boolean; message: () => string; } {
  try {
    const re = new RegExp(fullRegex, 'sm');
    const pass = re.test(received);

    return {
      pass,
      message: () =>
        pass
          ? `Expected string not to match pattern, but it did.\nPattern:\n${fullRegex}`
          : `Expected string to match pattern, but it didn't.\nPattern:\n${fullRegex}\n\nReceived:\n${received}`,
    };
  } catch (error) {
    return {
      pass: false,
      message: () =>
        `Invalid regex: ${error instanceof Error ? error.message : String(error)}\n\nPattern:\n${fullRegex}`,
    };
  }
}

expect.extend({
  toMatchLooseInlineSnapshot(this: unknown, received: unknown, strings: TemplateStringsArray, ...matchers: unknown[]) {
    const validationResult = validateInput(received);
    if (!validationResult.isValid) {
      return validationResult.result;
    }

    const pattern = buildPattern(strings, matchers);
    const dedentedPattern = dedentString(pattern);
    const flexiblePattern = makeWhitespaceFlexible(dedentedPattern);

    return executeRegexMatch(flexiblePattern, validationResult.value);
  },
});
