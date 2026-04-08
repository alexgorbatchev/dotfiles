/**
 * Oxlint JS plugin rule that prohibits bare imports of `@dotfiles/testing-helpers`.
 *
 * The testing-helpers package auto-registers matchers via side effects, but this
 * should be handled by the test setup, not individual test files.
 *
 * Bad:
 * - import '@dotfiles/testing-helpers';
 *
 * Good:
 * - import { TestLogger } from '@dotfiles/testing-helpers';
 * - (no import at all - let test setup handle it)
 */

const PACKAGE_NAME = "@dotfiles/testing-helpers";

/** @type {import('eslint').Rule.RuleModule} */
export const noUnnecessaryTestingHelpersImportRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow bare imports of @dotfiles/testing-helpers",
      recommended: true,
    },
    schema: [],
    messages: {
      unnecessaryImport: "This import is not necessary.",
    },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        // Check if this is an import of @dotfiles/testing-helpers
        if (node.source.value === PACKAGE_NAME) {
          // Check if it's a bare import (no specifiers)
          if (node.specifiers.length === 0) {
            context.report({
              node,
              messageId: "unnecessaryImport",
            });
          }
        }
      },
    };
  },
};
