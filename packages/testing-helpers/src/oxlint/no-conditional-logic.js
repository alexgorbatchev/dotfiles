/**
 * Oxlint JS plugin rule that prohibits usage of `if` statements and `throw new Error`
 * in test files. These patterns indicate conditional logic that should be replaced with
 * proper assertions.
 *
 * Use `assert()` from `node:assert` instead:
 * - assert() guarantees execution (no skipped assertions)
 * - assert() provides type narrowing in TypeScript
 * - assert() fails fast with clear error messages
 *
 * Examples:
 * - Instead of: if (!result.success) { expect(...) }
 *   Use: assert(!result.success); expect(...)
 *
 * - Instead of: if (condition) { throw new Error('fail') }
 *   Use: assert(condition, 'fail')
 *
 * Exceptions:
 * - `if` statements inside mock() functions are allowed (for conditional mock responses)
 */

/**
 * Check if a CallExpression is a mock() call
 * @param {import('estree').Node | undefined} node
 * @returns {boolean}
 */
function isMockCall(node) {
  return (
    node?.type === 'CallExpression' &&
    node.callee?.type === 'Identifier' &&
    node.callee.name === 'mock'
  );
}

/** @type {import('eslint').Rule.RuleModule} */
export const noConditionalLogicRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow if statements and throw new Error in test files',
      recommended: true,
    },
    schema: [],
    messages: {
      noIfStatement:
        "Don't use 'if' statements in tests. Use 'assert()' from 'node:assert' for type narrowing and conditional assertions.",
      noThrowNewError:
        "Don't use 'throw new Error' in tests. Use 'assert()' from 'node:assert' to fail with a condition.",
    },
  },
  create(context) {
    // Track depth of mock() call nesting
    let mockCallDepth = 0;

    return {
      // Track entering mock() calls
      'CallExpression'(node) {
        if (isMockCall(node)) {
          mockCallDepth++;
        }
      },
      // Track exiting mock() calls
      'CallExpression:exit'(node) {
        if (isMockCall(node)) {
          mockCallDepth--;
        }
      },
      IfStatement(node) {
        // Allow if statements inside mock() functions
        if (mockCallDepth > 0) {
          return;
        }
        context.report({
          node,
          messageId: 'noIfStatement',
        });
      },
      ThrowStatement(node) {
        // Check if this is `throw new Error(...)` or just `throw ...`
        // We want to catch both patterns in tests
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
