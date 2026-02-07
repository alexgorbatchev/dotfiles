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
const MIN_CONTENT_LINES = 2;

/**
 * Counts non-empty content lines in a string (trimmed, split by newlines)
 * @param {string} str
 * @returns {number}
 */
function countContentLines(str) {
  return str
    .trim()
    .split('\n')
    .filter((line) => line.trim().length > 0).length;
}

/**
 * Extracts the raw content from a template literal
 * @param {import('estree').TemplateLiteral} templateLiteral
 * @returns {string}
 */
function getTemplateContent(templateLiteral) {
  return templateLiteral.quasis.map((quasi) => quasi.value.raw).join('');
}

/**
 * Checks if a template literal has enough content lines
 * @param {import('estree').TemplateLiteral} templateLiteral
 * @returns {boolean}
 */
function hasEnoughLines(templateLiteral) {
  return countContentLines(getTemplateContent(templateLiteral)) >= MIN_CONTENT_LINES;
}

/**
 * Checks if a string has enough content lines
 * @param {string} str
 * @returns {boolean}
 */
function stringHasEnoughLines(str) {
  return countContentLines(str) >= MIN_CONTENT_LINES;
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
