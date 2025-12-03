/**
 * End-to-End Tests for Dotfiles Tool Installer
 *
 * Main entry point that runs all e2e test scenarios.
 */
import { describe } from 'bun:test';
import { Architecture, Platform } from '@dotfiles/core';
import {
  completionScenarios,
  conflictScenarios,
  dependencyScenarios,
  filesScenarios,
  generateScenarios,
  installScenarios,
  typeSafetyScenarios,
  updateScenarios,
} from '../helpers';
import { TestHarness } from '../TestHarness';
import { withMockServer } from '../withMockServer';

describe('E2E: Dotfiles CLI', () => {
  withMockServer();

  const platformConfigs: ReadonlyArray<{
    platform: Platform;
    architecture: Architecture;
    name: string;
  }> = [
    { platform: Platform.MacOS, architecture: Architecture.Arm64, name: 'macOS ARM64' },
    { platform: Platform.Linux, architecture: Architecture.X86_64, name: 'Linux x86_64' },
  ];

  // Run platform tests sequentially to avoid mock server conflicts
  for (const config of platformConfigs) {
    describe(`${config.name}`, () => {
      const harness: TestHarness = new TestHarness({
        testDir: import.meta.dir,
        configPath: 'fixtures/config-tools.yaml',
        platform: config.platform,
        architecture: config.architecture,
      });

      generateScenarios(harness, () => {
        updateScenarios(harness);
        completionScenarios(harness);
        installScenarios(harness);
      });

      filesScenarios(harness);
      conflictScenarios(harness);
      dependencyScenarios(import.meta.dir, config.platform, config.architecture, TestHarness);
    });
  }

  typeSafetyScenarios();
});
