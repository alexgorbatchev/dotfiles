import { dedentString } from '@dotfiles/utils';
import { expect } from 'bun:test';

declare module 'bun:test' {
  interface ILooseInlineSnapshotMatchers<T> {
    toMatchLooseInlineSnapshot(strings: TemplateStringsArray, ...matchers: unknown[]): T;
  }

  interface Matchers<T> extends ILooseInlineSnapshotMatchers<T> {}
}

function escapeRegexLiteral(value: unknown): string {
  return String(value).replace(/[-/\\^$*+?.()|[\]{}]/gm, '\\$&');
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
    const fullRegex = `^${dedentedPattern}$`;

    return executeRegexMatch(fullRegex, validationResult.value);
  },
});
