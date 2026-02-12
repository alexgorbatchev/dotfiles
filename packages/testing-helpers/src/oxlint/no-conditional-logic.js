/**
 * Oxlint JS plugin rule that prohibits usage of `if` statements in test files.
 * These patterns indicate conditional logic that should be replaced with proper assertions.
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
      description: 'Disallow if statements in test files',
      recommended: true,
    },
    schema: [],
    messages: {
      noIfStatement:
        "Don't use 'if' statements in tests. Use 'assert()' from 'node:assert' for type narrowing and conditional assertions.",
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
    };
  },
};
