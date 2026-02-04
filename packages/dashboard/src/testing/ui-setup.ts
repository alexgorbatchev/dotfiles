/**
 * UI Test Setup Helper
 *
 * Import this at the top of UI test files to set up DOM environment.
 * This registers happy-dom globals and testing-library matchers.
 *
 * Usage:
 * ```ts
 * import { render, screen, fireEvent } from '@dotfiles/dashboard/testing/ui-setup';
 * ```
 */

// Register DOM globals FIRST using top-level await to ensure order
if (typeof document === 'undefined') {
  const { GlobalRegistrator } = await import('@happy-dom/global-registrator');
  GlobalRegistrator.register();
}

// Now we can safely import testing-library (it checks for document at import time)
const jestDomMatchers = await import('@testing-library/jest-dom/matchers');
const testingLibrary = await import('@testing-library/preact');
const userEventLib = await import('@testing-library/user-event');
const { afterEach, expect } = await import('bun:test');

const { cleanup, fireEvent, render, screen } = testingLibrary;
const userEvent = userEventLib.default;

// Extend expect with jest-dom matchers (exclude 'default' key from namespace import)
const { default: _, ...matchers } = jestDomMatchers;
expect.extend(matchers);

// Clean up after each test
afterEach(() => {
  cleanup();
});

// Re-export testing utilities
export { fireEvent, render, screen, userEvent };
