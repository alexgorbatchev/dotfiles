import { beforeEach, describe, expect, it, type mock } from 'bun:test';
import path from 'node:path';
import {
  createBasicToolConfig,
  createInstallerTestSetup,
  type InstallerTestSetup,
  MOCK_TOOL_NAME,
} from './installer-test-helpers';

describe('Installer - installManually', () => {
  let setup: InstallerTestSetup;

  beforeEach(async () => {
    setup = await createInstallerTestSetup();
  });

  it('should check if binary exists', async () => {
    const manualBinaryPath = '/usr/local/bin/test-tool';
    const expectedFinalPath = path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, 'unknown', MOCK_TOOL_NAME);

    // Create the manual binary file in the mock filesystem
    await setup.mockFileSystem.ensureDir(path.dirname(manualBinaryPath));
    await setup.mockFileSystem.writeFile(manualBinaryPath, 'manual binary content');

    const toolConfig = createBasicToolConfig({
      installationMethod: 'manual',
      installParams: {
        binaryPath: manualBinaryPath,
      },
    });

    const context = {
      toolName: MOCK_TOOL_NAME,
      installDir: path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, 'unknown'),
      systemInfo: { platform: 'linux', arch: 'x64', release: '', homeDir: setup.testDirs.paths.homeDir },
      toolConfig,
      appConfig: setup.mockAppConfig,
    };

    const result = await setup.installer.installManually(MOCK_TOOL_NAME, toolConfig, context);

    expect(setup.fileSystemMocks.exists).toHaveBeenCalledWith(manualBinaryPath);
    expect(setup.fileSystemMocks.ensureDir).toHaveBeenCalled();
    expect(setup.fileSystemMocks.copyFile).toHaveBeenCalledWith(manualBinaryPath, expectedFinalPath);
    expect(setup.fileSystemMocks.chmod).not.toHaveBeenCalledWith();
    expect(result.success).toBe(true);
    expect(result.binaryPath).toBe(expectedFinalPath);
    expect(result.info).toEqual({
      manualInstall: true,
      originalPath: manualBinaryPath,
    });
  });

  it('should return error if binary does not exist', async () => {
    (setup.fileSystemMocks.exists as ReturnType<typeof mock>).mockResolvedValue(false);
    const manualBinaryPath = '/usr/local/bin/non-existent-tool';
    const toolConfig = createBasicToolConfig({
      installationMethod: 'manual',
      installParams: {
        binaryPath: manualBinaryPath,
      },
    });

    const context = {
      toolName: MOCK_TOOL_NAME,
      installDir: path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME),
      systemInfo: { platform: 'linux', arch: 'x64', release: '', homeDir: setup.testDirs.paths.homeDir },
      toolConfig,
      appConfig: setup.mockAppConfig,
    };

    const result = await setup.installer.installManually(MOCK_TOOL_NAME, toolConfig, context);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Binary not found');
  });
});
