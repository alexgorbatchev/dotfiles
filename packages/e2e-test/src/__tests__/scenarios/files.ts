import { beforeAll, describe, expect, it } from 'bun:test';
import type { TestHarness } from '../../TestHarness';

export function filesScenarios(harness: TestHarness): void {
  describe('files command', () => {
    beforeAll(async () => {
      await harness.clean();
      await harness.generate();
    });

    it('should display tree of installed tool files', async () => {
      // Install the tool first
      const installResult = await harness.install(['github-release-tool']);
      expect(installResult.code).toBe(0);

      // Then check files command
      const result = await harness.runCommand(['files', '--config', harness.configPath, 'github-release-tool']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('github-release-tool');
      expect(result.stdout).toContain('└─');
    });

    it('should fail for tool that exists but is not installed', async () => {
      const result = await harness.runCommand(['files', '--config', harness.configPath, 'cargo-quickinstall-tool']);

      expect(result.code).not.toBe(0);
      expect(result.stdout).toContain('not installed');
    });
  });
}
