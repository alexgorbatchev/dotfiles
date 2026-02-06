/**
 * Oxlint JS plugin rule that requires `toMatchLooseInlineSnapshot` to use multiline template literals.
 *
 * The purpose of toMatchLooseInlineSnapshot is to capture surrounding context, which requires
 * the snapshot content to span multiple lines.
 *
 * Bad:
 * - expect().toMatchLooseInlineSnapshot(`...`)
 * - expect().toMatchLooseInlineSnapshot``
 *
 * Good:
 * - expect().toMatchLooseInlineSnapshot`
 *     ...
 *   `
 */

const MATCHER_NAME = 'toMatchLooseInlineSnapshot';

/**
 * Checks if a template literal spans multiple lines (has at least one newline in quasis)
 * @param {import('estree').TemplateLiteral} templateLiteral
 * @returns {boolean}
 */
function isMultilineTemplateLiteral(templateLiteral) {
  // Check if any of the quasis (string parts) contain a newline
  for (const quasi of templateLiteral.quasis) {
    if (quasi.value.raw.includes('\n')) {
      return true;
    }
  }
  return false;
}

/**
 * Walks up the AST to check if this is part of an expect() chain
 * @param {import('estree').Node} startNode
 * @returns {boolean}
 */
function isExpectChain(startNode) {
  let current = startNode;

  while (current) {
    if (
      current.type === 'CallExpression' &&
      current.callee.type === 'Identifier' &&
      current.callee.name === 'expect'
    ) {
      return true;
    }

    // Handle chained calls like expect(...).not.toMatchLooseInlineSnapshot()
    if (current.type === 'MemberExpression') {
      current = current.object;
    } else if (current.type === 'CallExpression') {
      current = current.callee;
    } else {
      break;
    }
  }
  return false;
}

/** @type {import('eslint').Rule.RuleModule} */
export const requireMultilineLooseSnapshotRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require toMatchLooseInlineSnapshot to use multiline template literals for capturing context',
      recommended: true,
    },
    schema: [],
    messages: {
      requireMultiline: "'toMatchLooseInlineSnapshot' needs more context, add more lines.",
    },
  },
  create(context) {
    return {
      // Handle tagged template expressions: expect().toMatchLooseInlineSnapshot`...`
      TaggedTemplateExpression(node) {
        if (
          node.tag.type === 'MemberExpression' &&
          node.tag.property.type === 'Identifier' &&
          node.tag.property.name === MATCHER_NAME
        ) {
          // Verify this is part of an expect chain
          if (!isExpectChain(node.tag.object)) {
            return;
          }

          // Check if the template literal is multiline
          if (!isMultilineTemplateLiteral(node.quasi)) {
            context.report({
              node: node.tag.property,
              messageId: 'requireMultiline',
            });
          }
        }
      },

      // Handle call expressions: expect().toMatchLooseInlineSnapshot(`...`)
      CallExpression(node) {
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.property.type === 'Identifier' &&
          node.callee.property.name === MATCHER_NAME
        ) {
          // Verify this is part of an expect chain
          if (!isExpectChain(node.callee.object)) {
            return;
          }

          // Check if the first argument is a template literal
          const firstArg = node.arguments[0];
          if (firstArg && firstArg.type === 'TemplateLiteral') {
            if (!isMultilineTemplateLiteral(firstArg)) {
              context.report({
                node: node.callee.property,
                messageId: 'requireMultiline',
              });
            }
          } else if (firstArg && firstArg.type === 'Literal' && typeof firstArg.value === 'string') {
            // String literal argument - check for newlines
            if (!firstArg.value.includes('\n')) {
              context.report({
                node: node.callee.property,
                messageId: 'requireMultiline',
              });
            }
          }
        }
      },
    };
  },
};
