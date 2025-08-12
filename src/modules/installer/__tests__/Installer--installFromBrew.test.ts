import { beforeEach, describe, expect, it } from 'bun:test';
import path from 'node:path';
import {
  createBasicToolConfig,
  createInstallerTestSetup,
  createTestContext,
  type InstallerTestSetup,
  MOCK_TOOL_NAME,
} from './installer-test-helpers';

describe('Installer - installFromBrew', () => {
  let setup: InstallerTestSetup;

  beforeEach(async () => {
    setup = await createInstallerTestSetup();
  });

  it('should simulate brew installation', async () => {
    const toolConfig = createBasicToolConfig({
      installationMethod: 'brew',
      installParams: {
        formula: 'test-formula',
        cask: true,
        tap: 'test-tap',
      },
    });

    const context = createTestContext(setup, {
      installDir: path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME),
    });

    const result = await setup.installer.installFromBrew(MOCK_TOOL_NAME, toolConfig, context);

    expect(result.success).toBe(true);
    expect(result.info).toEqual({
      formula: 'test-formula',
      isCask: true,
      tap: 'test-tap',
    });
  });
});
