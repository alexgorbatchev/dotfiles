/**
 * Oxlint JS plugin rule that requires `toMatchLooseInlineSnapshot` to use multiline template literals
 * with at least two lines of content.
 *
 * The purpose of toMatchLooseInlineSnapshot is to capture surrounding context, which requires
 * the snapshot content to span at least two lines.
 *
 * Bad:
 * - expect().toMatchLooseInlineSnapshot(`...`)
 * - expect().toMatchLooseInlineSnapshot``
 * - expect().toMatchLooseInlineSnapshot`
 *     foo
 *   `
 *
 * Good:
 * - expect().toMatchLooseInlineSnapshot`
 *     foo
 *     bar
 *   `
 */

const MATCHER_NAME = 'toMatchLooseInlineSnapshot';
const MIN_NEWLINES = 2;

/**
 * Counts the number of newlines in a template literal
 * @param {import('estree').TemplateLiteral} templateLiteral
 * @returns {number}
 */
function countNewlines(templateLiteral) {
  let count = 0;
  for (const quasi of templateLiteral.quasis) {
    const matches = quasi.value.raw.match(/\n/g);
    if (matches) {
      count += matches.length;
    }
  }
  return count;
}

/**
 * Checks if a template literal has enough lines (at least MIN_NEWLINES newlines)
 * @param {import('estree').TemplateLiteral} templateLiteral
 * @returns {boolean}
 */
function hasEnoughLines(templateLiteral) {
  return countNewlines(templateLiteral) >= MIN_NEWLINES;
}

/**
 * Checks if a string has enough lines (at least MIN_NEWLINES newlines)
 * @param {string} str
 * @returns {boolean}
 */
function stringHasEnoughLines(str) {
  const matches = str.match(/\n/g);
  return matches ? matches.length >= MIN_NEWLINES : false;
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

          // Check if the template literal has enough lines
          if (!hasEnoughLines(node.quasi)) {
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
            if (!hasEnoughLines(firstArg)) {
              context.report({
                node: node.callee.property,
                messageId: 'requireMultiline',
              });
            }
          } else if (firstArg && firstArg.type === 'Literal' && typeof firstArg.value === 'string') {
            // String literal argument - check for enough lines
            if (!stringHasEnoughLines(firstArg.value)) {
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
