/**
 * Oxlint JS plugin rule that prohibits usage of `expect().toContain()` and `expect().toMatch()`
 * in test files. These partial string matchers can lead to false positives in tests.
 *
 * Use more specific matchers instead:
 * - Instead of toContain(), use toMatchLooseInlineSnapshot() or toContainEqual() for arrays
 * - Instead of toMatch(), use toMatchLooseInlineSnapshot() for pattern matching
 *
 * Allowed matchers (not flagged):
 * - toContainEqual (for arrays)
 * - toMatchObject (for object matching)
 * - toMatchInlineSnapshot
 * - toMatchLooseInlineSnapshot
 * - toMatchSnapshot
 */

/** @type {string[]} */
const PROHIBITED_MATCHERS = new Set(['toContain', 'toMatch']);

/** @type {import('eslint').Rule.RuleModule} */
export const noPartialStringMatchersRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow partial string matchers (toContain, toMatch) that can cause false positives',
      recommended: true,
    },
    schema: [],
    messages: {
      noToContain: "Use 'toMatchLooseInlineSnapshot' with surrounding context.",
      noToMatch: "Use 'toMatchLooseInlineSnapshot' with surrounding context.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        // Check for expect(...).toContain() or expect(...).toMatch()
        // AST structure: CallExpression with callee of type MemberExpression
        // where property is 'toContain' or 'toMatch'
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.property.type === 'Identifier' &&
          PROHIBITED_MATCHERS.has(node.callee.property.name)
        ) {
          const matcherName = node.callee.property.name;
          const messageId = matcherName === 'toContain' ? 'noToContain' : 'noToMatch';

          // Verify this is part of an expect chain
          // The object should eventually lead back to an expect() call
          let current = node.callee.object;

          // Walk up the chain to find expect()
          while (current) {
            if (
              current.type === 'CallExpression' && current.callee.type === 'Identifier' &&
              current.callee.name === 'expect'
            ) {
              // Found expect() - report the violation
              context.report({
                node: node.callee.property,
                messageId,
              });
              break;
            }

            // Handle chained calls like expect(...).not.toContain()
            if (current.type === 'MemberExpression') {
              current = current.object;
            } else if (current.type === 'CallExpression') {
              current = current.callee;
            } else {
              break;
            }
          }
        }
      },
    };
  },
};
