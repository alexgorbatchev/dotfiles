import { describe } from 'bun:test';
import { Architecture, Platform } from '@dotfiles/core';
import { generateScenarios, installScenarios, updateScenarios } from '../scenarios';
import { TestHarness } from '../TestHarness';
import { withMockServer } from '../withMockServer';

const platformConfigs = [
  { platform: Platform.MacOS, architecture: Architecture.Arm64, name: 'macOS ARM64' },
  { platform: Platform.Linux, architecture: Architecture.X86_64, name: 'Linux x86_64' },
];

describe('E2E: dotfiles CLI', () => {
  withMockServer();

  // Run platform tests sequentially to avoid mock server conflicts
  for (const config of platformConfigs) {
    describe(`${config.name}`, () => {
      const harness = new TestHarness({
        testDir: import.meta.dir,
        platform: config.platform,
        architecture: config.architecture,
      });

      generateScenarios(harness, () => {
        updateScenarios(harness);
      });

      installScenarios(harness);
    });
  }
});
