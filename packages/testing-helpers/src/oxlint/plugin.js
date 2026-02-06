/**
 * Oxlint JS plugin for dotfiles-testing rules.
 *
 * This plugin combines all testing-related linting rules:
 * - no-partial-string-matchers: Disallows toContain() and toMatch() in expect chains
 * - require-multiline-loose-snapshot: Requires toMatchLooseInlineSnapshot to use multiline templates
 */

import { noPartialStringMatchersRule } from './no-partial-string-matchers.js';
import { requireMultilineLooseSnapshotRule } from './require-multiline-loose-snapshot.js';

const plugin = {
  meta: {
    name: 'dotfiles-testing',
    version: '1.0.0',
  },
  rules: {
    'no-partial-string-matchers': noPartialStringMatchersRule,
    'require-multiline-loose-snapshot': requireMultilineLooseSnapshotRule,
  },
};

// oxlint-disable-next-line import/no-default-export
export default plugin;
