import { describe } from 'bun:test';
import { Architecture, Platform } from '@dotfiles/schemas';
import { TestHarness } from '../TestHarness';
import { setupMockServer } from '../mockServerHelper';
import { generateScenarios, updateScenarios } from '../scenarios';

const platformConfigs = [
  { platform: Platform.MacOS, architecture: Architecture.Arm64, name: 'macOS ARM64' },
  { platform: Platform.Linux, architecture: Architecture.X86_64, name: 'Linux x86_64' },
];

describe('E2E: dotfiles CLI', () => {
  setupMockServer();

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
    });
  }
});
