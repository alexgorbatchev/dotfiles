/**
 * Oxlint JS plugin rule that prohibits usage of `throw new Error` in test files.
 * This pattern indicates conditional logic that should be replaced with proper assertions.
 *
 * Use `assert()` from `node:assert` instead:
 * - assert() guarantees execution (no skipped assertions)
 * - assert() provides type narrowing in TypeScript
 * - assert() fails fast with clear error messages
 *
 * Examples:
 * - Instead of: if (condition) { throw new Error('fail') }
 *   Use: assert(condition, 'fail')
 */

/** @type {import('eslint').Rule.RuleModule} */
export const noThrowInTestsRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow throw new Error in test files',
      recommended: true,
    },
    schema: [],
    messages: {
      noThrowNewError:
        "Don't use 'throw new Error' in tests. Use 'assert()' from 'node:assert' to fail with a condition.",
    },
  },
  create(context) {
    return {
      ThrowStatement(node) {
        // Check if this is `throw new Error(...)`
        // We want to catch this pattern in tests
        if (
          node.argument?.type === 'NewExpression' &&
          node.argument.callee.type === 'Identifier' &&
          node.argument.callee.name === 'Error'
        ) {
          context.report({
            node,
            messageId: 'noThrowNewError',
          });
        }
      },
    };
  },
};
