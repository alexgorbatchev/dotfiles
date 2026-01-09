import { describe, expect, it } from 'bun:test';
import type { TestHarness } from '../../TestHarness';

/**
 * Defines test scenarios for the --trace flag.
 *
 * These tests verify that:
 * - --trace enables source location logging
 * - Default behavior hides source location logging
 * - --quiet overrides --trace
 *
 * @param harness - The TestHarness instance to use for running tests.
 */
export function traceScenarios(harness: TestHarness): void {
  describe('trace configuration', () => {
    it('should show file paths when --trace is used', async () => {
      const result = await harness.generate(['--trace']);
      expect(result.code).toBe(0);
      expect(result.stdout.trim()).toMatchLooseInlineSnapshot`
        WARN	${/[^\s]+\.ts:\d+/} - Platform overridden to: ${expect.anything}
        WARN	${/[^\s]+\.ts:\d+/} - Arch overridden to: ${expect.anything}
        INFO	${/[^\s]+\.ts:\d+/} - Caching disabled
        INFO	${/[^\s]+\.ts:\d+/} - [system] rm ${expect.anything}
        INFO	${/[^\s]+\.ts:\d+/} - [system] rm ${expect.anything}
        INFO	${/[^\s]+\.ts:\d+/} - [system] write ${expect.anything}
        INFO	${/[^\s]+\.ts:\d+/} - [system] write ${expect.anything}
        INFO	${/[^\s]+\.ts:\d+/} - DONE
      `;
    });

    it('should NOT show file paths when --trace is NOT used', async () => {
      const result = await harness.generate([]);
      expect(result.code).toBe(0);
      expect(result.stdout.trim()).toMatchLooseInlineSnapshot`
        WARN	Platform overridden to: ${expect.anything}
        WARN	Arch overridden to: ${expect.anything}
        INFO	Caching disabled
        INFO	[system] rm ${expect.anything}
        INFO	[system] rm ${expect.anything}
        INFO	[system] write ${expect.anything}
        INFO	[system] write ${expect.anything}
        INFO	DONE
      `;
    });

    it('should NOT show anything when --quiet --trace is used', async () => {
      const result = await harness.generate(['--quiet', '--trace']);
      expect(result.code).toBe(0);
      // Usually quiet means empty stdout/stderr or very minimal
      expect(result.stdout.trim()).toBe('');
    });
  });
}
