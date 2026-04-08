/**
 * Oxlint JS plugin rule that enforces correct indentation for multiline template literals.
 *
 * Template literal content should be indented to match the surrounding code context.
 * When a template starts with a newline, its content should be indented relative to
 * the line where the template is declared.
 *
 * Bad:
 * ```
 *     const content = `
 * export default (install) =>
 *   install('manual', { binaryPath: '/usr/bin/tool' });
 * `;
 * ```
 *
 * Good:
 * ```
 *     const content = `
 *       export default (install) =>
 *         install('manual', { binaryPath: '/usr/bin/tool' });
 *     `;
 * ```
 */

/**
 * Gets the indentation (number of leading spaces/tabs) of a line
 * @param {string} line
 * @returns {number}
 */
function getIndentSize(line) {
  const match = line.match(/^[ \t]*/);
  return match ? match[0].length : 0;
}

/**
 * Gets the minimum indentation of non-empty lines in a string
 * @param {string} content
 * @returns {number}
 */
function getMinContentIndent(content) {
  const lines = content.split("\n");
  let minIndent = Infinity;

  for (const line of lines) {
    // Skip empty lines or whitespace-only lines
    if (line.trim().length === 0) continue;
    const indent = getIndentSize(line);
    minIndent = Math.min(minIndent, indent);
  }

  return minIndent === Infinity ? 0 : minIndent;
}

/**
 * Checks if a template literal starts with a newline (multiline template)
 * @param {string} raw
 * @returns {boolean}
 */
function startsWithNewline(raw) {
  return raw.startsWith("\n");
}

/**
 * Checks if a template literal has content that needs indentation checking
 * @param {string} raw
 * @returns {boolean}
 */
function hasNonEmptyContent(raw) {
  // Remove leading newline and check if there's actual content
  const content = raw.replace(/^\n/, "");
  return content.trim().length > 0;
}

/**
 * Extracts the raw content from a template literal
 * @param {import('estree').TemplateLiteral} templateLiteral
 * @returns {string}
 */
function getTemplateContent(templateLiteral) {
  return templateLiteral.quasis.map((quasi) => quasi.value.raw).join("${...}");
}

/** @type {import('eslint').Rule.RuleModule} */
export const requireTemplateIndentRule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Require multiline template literals to be indented to match surrounding context",
      recommended: true,
    },
    schema: [],
    messages: {
      badIndent: "Template content should be indented. Use dedentString() if indentation is significant.",
    },
  },
  create(context) {
    const sourceCode = context.getSourceCode?.() || context.sourceCode;

    return {
      TemplateLiteral(node) {
        const raw = getTemplateContent(node);

        // Only check templates that start with a newline (multiline templates)
        if (!startsWithNewline(raw)) {
          return;
        }

        // Only check templates with actual content
        if (!hasNonEmptyContent(raw)) {
          return;
        }

        // Get the line where the template literal starts
        const startLine = node.loc?.start?.line;
        if (!startLine) return;

        // Get the source text for the line
        const lineText = sourceCode?.getLines?.()[startLine - 1];
        if (!lineText) return;

        // Get the indentation of the line where the template is defined
        const lineIndent = getIndentSize(lineText);

        // Get the minimum indentation of content inside the template
        // Skip the first line (empty after the opening backtick)
        const contentAfterFirstNewline = raw.replace(/^\n/, "");
        const contentIndent = getMinContentIndent(contentAfterFirstNewline);

        // Content should be indented at least as much as the line it's on
        // (or more, for nested structures)
        if (contentIndent < lineIndent) {
          context.report({
            node,
            messageId: "badIndent",
          });
        }
      },
    };
  },
};
