import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/preact';
import { afterEach, expect } from 'bun:test';

expect.extend(matchers);

// Cleans up `render` after each test
afterEach(() => {
  cleanup();
});
