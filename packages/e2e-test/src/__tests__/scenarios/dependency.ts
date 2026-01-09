import { describe, expect, it } from 'bun:test';
import type { Architecture, Platform } from '@dotfiles/core';
import { TestHarness } from '../../TestHarness';

/**
 * Defines test scenarios for dependency resolution and ordering.
 *
 * These tests verify that the CLI correctly:
 * - Handles successful dependency resolution
 * - Detects missing dependency providers
 * - Detects ambiguous dependencies (multiple providers)
 * - Detects circular dependencies
 * - Handles platform-specific dependency availability
 *
 * @param baseTestDir - The base test directory for creating scenario-specific harnesses.
 * @param platform - The platform to test.
 * @param architecture - The architecture to test.
 */
export function dependencyScenarios(baseTestDir: string, platform: Platform, architecture: Architecture): void {
  describe('dependency resolution', () => {
    it('generates successfully when dependencies are satisfied', async () => {
      const harness = new TestHarness({
        testDir: baseTestDir,
        configPath: 'fixtures/tools-dependencies/success/config.yaml',
        platform,
        architecture,
        cleanBeforeRun: true,
      });
      const result = await harness.generate();
      expect(result.code).toBe(0);
      await harness.verifyShim('dependency-provider');
      await harness.verifyShim('dependency-consumer');
    });

    it('fails when a dependency provider is missing', async () => {
      const harness = new TestHarness({
        testDir: baseTestDir,
        configPath: 'fixtures/tools-dependencies/missing-provider/config.yaml',
        platform,
        architecture,
        cleanBeforeRun: true,
      });
      const result = await harness.generate();
      expect(result.code).toBe(1);
      const combinedOutput = `${result.stdout}${result.stderr}`;
      expect(combinedOutput).toContain('Missing dependency: tool "dependency-consumer-missing" requires binary');
      expect(combinedOutput).toContain('missing-provider');
    });

    it('fails when multiple tools provide the same dependency', async () => {
      const harness = new TestHarness({
        testDir: baseTestDir,
        configPath: 'fixtures/tools-dependencies/ambiguous/config.yaml',
        platform,
        architecture,
        cleanBeforeRun: true,
      });
      const result = await harness.generate();
      expect(result.code).toBe(1);
      const combinedOutput = `${result.stdout}${result.stderr}`;
      expect(combinedOutput).toContain(
        'Ambiguous dependency: binary "shared-dependency" is provided by multiple tools'
      );
      expect(combinedOutput).toContain('dependency-provider-a');
      expect(combinedOutput).toContain('dependency-provider-b');
      expect(combinedOutput).toContain('dependency-consumer-ambiguous');
    });

    it('fails when dependencies create a cycle', async () => {
      const harness = new TestHarness({
        testDir: baseTestDir,
        configPath: 'fixtures/tools-dependencies/circular/config.yaml',
        platform,
        architecture,
        cleanBeforeRun: true,
      });
      const result = await harness.generate();
      expect(result.code).toBe(1);
      const combinedOutput = `${result.stdout}${result.stderr}`;
      expect(combinedOutput).toContain('Circular dependency detected between tools');
      expect(combinedOutput).toContain('dependency-cycle-a');
      expect(combinedOutput).toContain('dependency-cycle-b');
    });

    it('fails when the dependency provider is unavailable on the active platform', async () => {
      const harness = new TestHarness({
        testDir: baseTestDir,
        configPath: 'fixtures/tools-dependencies/platform-mismatch/config.yaml',
        platform,
        architecture,
        cleanBeforeRun: true,
      });
      const result = await harness.generate();
      expect(result.code).toBe(1);
      const combinedOutput = `${result.stdout}${result.stderr}`;
      expect(combinedOutput).toContain('Missing dependency: tool "dependency-platform-consumer" requires binary');
      expect(combinedOutput).toContain('platform-specific-binary');
    });
  });
}
