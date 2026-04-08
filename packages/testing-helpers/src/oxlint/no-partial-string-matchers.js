/**
 * Oxlint JS plugin rule that prohibits usage of `expect().toContain()` and `expect().toMatch()`
 * in test files. These partial string matchers can lead to false positives in tests.
 *
 * Use more specific matchers instead:
 * - Instead of toContain(), use toMatchLooseInlineSnapshot() or toContainEqual() for arrays
 * - Instead of toMatch() with regex, use toMatchRegex() for single-line strings
 * - Instead of toMatch() with string, use toMatchLooseInlineSnapshot() for pattern matching
 *
 * Allowed matchers (not flagged):
 * - .not.toContain() (negative assertions are useful)
 * - .not.toMatch() (negative assertions are useful)
 * - toContainEqual (for arrays)
 * - toMatchObject (for object matching)
 * - toMatchInlineSnapshot
 * - toMatchLooseInlineSnapshot
 * - toMatchSnapshot
 * - toMatchRegex
 */

/** @type {string[]} */
const PROHIBITED_MATCHERS = new Set(["toContain", "toMatch"]);

/** @type {Set<string>} */
const BOOLEAN_MATCHERS_WITH_ARG = new Set(["toBe", "toEqual", "toStrictEqual"]);

/** @type {Set<string>} */
const BOOLEAN_MATCHERS_NO_ARG = new Set(["toBeTrue", "toBeTruthy", "toBeFalse", "toBeFalsy"]);

/**
 * Check if a node is a regex literal
 * @param {import('estree').Node | undefined} node
 * @returns {boolean}
 */
function isRegexLiteral(node) {
  if (!node) return false;
  // RegExp literal: /pattern/
  if (node.type === "Literal" && node.regex) return true;
  // new RegExp(...) call
  if (node.type === "NewExpression" && node.callee.type === "Identifier" && node.callee.name === "RegExp") {
    return true;
  }
  return false;
}

/**
 * Check if a node is a boolean literal (true or false)
 * @param {import('estree').Node | undefined} node
 * @returns {boolean}
 */
function isBooleanLiteral(node) {
  return node?.type === "Literal" && typeof node.value === "boolean";
}

/**
 * Check if a CallExpression is a .includes() call on a string/array
 * @param {import('estree').Node | undefined} node
 * @returns {boolean}
 */
function isIncludesCall(node) {
  return (
    node?.type === "CallExpression" &&
    node.callee.type === "MemberExpression" &&
    node.callee.property.type === "Identifier" &&
    node.callee.property.name === "includes"
  );
}

/** @type {import('eslint').Rule.RuleModule} */
export const noPartialStringMatchersRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow partial string matchers (toContain, toMatch) that can cause false positives",
      recommended: true,
    },
    schema: [],
    messages: {
      noToContain: "Use 'toMatchLooseInlineSnapshot' with surrounding context.",
      noToMatch: "Use 'toMatchLooseInlineSnapshot' with surrounding context.",
      noToMatchRegex: "Use 'toMatchRegex' for single-line regex matching.",
      noIncludesWorkaround:
        "Don't use '.includes()' with boolean matchers. Use 'toMatchLooseInlineSnapshot' with surrounding context.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        // Check for expect(x.includes(...)).toBe(true/false) pattern
        // Also catches toBeTrue(), toBeTruthy(), toBeFalse(), toBeFalsy()
        // This is a workaround for toContain that we also want to prohibit
        if (node.callee.type === "MemberExpression" && node.callee.property.type === "Identifier") {
          const matcherName = node.callee.property.name;
          const isMatcherWithBoolArg =
            BOOLEAN_MATCHERS_WITH_ARG.has(matcherName) &&
            node.arguments?.length === 1 &&
            isBooleanLiteral(node.arguments[0]);
          const isMatcherNoArg = BOOLEAN_MATCHERS_NO_ARG.has(matcherName);

          if (isMatcherWithBoolArg || isMatcherNoArg) {
            // Check if the object is expect() with an includes() call inside
            // Also handle .not modifier: expect(...).not.toBe(...)
            let expectCall = node.callee.object;

            // Handle .not modifier
            if (
              expectCall?.type === "MemberExpression" &&
              expectCall.property.type === "Identifier" &&
              expectCall.property.name === "not"
            ) {
              expectCall = expectCall.object;
            }

            if (
              expectCall?.type === "CallExpression" &&
              expectCall.callee.type === "Identifier" &&
              expectCall.callee.name === "expect" &&
              expectCall.arguments.length > 0 &&
              isIncludesCall(expectCall.arguments[0])
            ) {
              context.report({
                node: expectCall.arguments[0].callee.property,
                messageId: "noIncludesWorkaround",
              });
              return;
            }
          }
        }

        // Check for expect(...).toContain() or expect(...).toMatch()
        // AST structure: CallExpression with callee of type MemberExpression
        // where property is 'toContain' or 'toMatch'
        // NOTE: We allow .not.toContain() and .not.toMatch() as negative assertions are useful
        if (
          node.callee.type === "MemberExpression" &&
          node.callee.property.type === "Identifier" &&
          PROHIBITED_MATCHERS.has(node.callee.property.name)
        ) {
          const matcherName = node.callee.property.name;
          let messageId = matcherName === "toContain" ? "noToContain" : "noToMatch";

          // For toMatch(), check if the argument is a regex
          if (matcherName === "toMatch" && node.arguments.length > 0) {
            if (isRegexLiteral(node.arguments[0])) {
              messageId = "noToMatchRegex";
            }
          }

          // Verify this is part of an expect chain
          // The object should eventually lead back to an expect() call
          let current = node.callee.object;
          let hasNotModifier = false;

          // Walk up the chain to find expect()
          while (current) {
            // Check for .not modifier - if present, allow the assertion
            if (
              current.type === "MemberExpression" &&
              current.property.type === "Identifier" &&
              current.property.name === "not"
            ) {
              hasNotModifier = true;
              break;
            }

            if (
              current.type === "CallExpression" &&
              current.callee.type === "Identifier" &&
              current.callee.name === "expect"
            ) {
              // Found expect() - report the violation
              context.report({
                node: node.callee.property,
                messageId,
              });
              break;
            }

            // Handle chained calls like expect(...).not.toContain()
            if (current.type === "MemberExpression") {
              current = current.object;
            } else if (current.type === "CallExpression") {
              current = current.callee;
            } else {
              break;
            }
          }

          // Skip reporting if .not modifier was found
          if (hasNotModifier) {
            return;
          }
        }
      },
    };
  },
};
