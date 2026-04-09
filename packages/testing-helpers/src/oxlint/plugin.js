/**
 * Oxlint JS plugin for dotfiles-testing rules.
 *
 * This plugin combines all testing-related linting rules:
 * - no-conditional-logic: Disallows if statements and throw new Error in tests
 * - no-partial-string-matchers: Disallows toContain() and toMatch() in expect chains
 * - require-multiline-loose-snapshot: Requires toMatchLooseInlineSnapshot to use multiline templates
 * - no-unnecessary-testing-helpers-import: Disallows bare imports of testing-helpers package
 * - require-template-indent: Requires multiline template literals to match surrounding indentation
 */

import { noConditionalLogicRule } from "./no-conditional-logic.js";
import { noPartialStringMatchersRule } from "./no-partial-string-matchers.js";
import { noThrowInTestsRule } from "./no-throw-in-tests.js";
import { noUnnecessaryTestingHelpersImportRule } from "./no-unnecessary-testing-helpers-import.js";
import { requireMultilineLooseSnapshotRule } from "./require-multiline-loose-snapshot.js";
import { requireTemplateIndentRule } from "./require-template-indent.js";

const plugin = {
  meta: {
    name: "dotfiles-testing",
    version: "1.0.0",
  },
  rules: {
    "no-conditional-logic": noConditionalLogicRule,
    "no-partial-string-matchers": noPartialStringMatchersRule,
    "no-throw-in-tests": noThrowInTestsRule,
    "no-unnecessary-testing-helpers-import": noUnnecessaryTestingHelpersImportRule,
    "require-multiline-loose-snapshot": requireMultilineLooseSnapshotRule,
    "require-template-indent": requireTemplateIndentRule,
  },
};

export default plugin;
