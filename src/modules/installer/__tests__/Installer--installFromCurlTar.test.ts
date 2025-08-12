import { beforeEach, describe, expect, it, mock } from 'bun:test';
import path from 'node:path';
import type { BaseInstallContext, CurlTarToolConfig } from '@types';
import {
  createInstallerTestSetup,
  type InstallerTestSetup,
  MOCK_TOOL_NAME,
  MOCK_TOOL_VERSION,
} from './installer-test-helpers';

describe('Installer - installFromCurlTar', () => {
  let setup: InstallerTestSetup;

  beforeEach(async () => {
    setup = await createInstallerTestSetup();
  });

  it('should download and extract tarball', async () => {
    const toolConfig: CurlTarToolConfig = {
      name: MOCK_TOOL_NAME,
      binaries: [MOCK_TOOL_NAME],
      version: MOCK_TOOL_VERSION,
      installationMethod: 'curl-tar',
      installParams: {
        url: 'https://example.com/archive.tar.gz',
        extractPath: 'bin/tool',
      },
    };

    // Setup mockExists for the path of the binary within the temp extraction directory
    const expectedTempExtractedBinaryPath = path.join(
      setup.testDirs.paths.binariesDir,
      MOCK_TOOL_NAME,
      MOCK_TOOL_VERSION,
      'temp-extract',
      'bin/tool' // This comes from toolConfig.installParams.extractPath
    );

    // The binary should be copied to the final location
    const installDir = path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, MOCK_TOOL_VERSION);
    const tempExtractDir = path.join(installDir, 'temp-extract');
    const context: BaseInstallContext = {
      // context is defined here
      toolName: MOCK_TOOL_NAME,
      installDir,
      systemInfo: { platform: 'linux', arch: 'x64', release: '', homeDir: setup.testDirs.paths.homeDir },
      toolConfig,
      appConfig: setup.mockAppConfig,
    };

    // Create the temp extract directory and binary file in the mock filesystem
    await setup.mockFileSystem.ensureDir(tempExtractDir);
    await setup.mockFileSystem.ensureDir(path.dirname(expectedTempExtractedBinaryPath));
    await setup.mockFileSystem.writeFile(expectedTempExtractedBinaryPath, 'binary content');
    // Also create the binary at the tool name location (fallback path)
    await setup.mockFileSystem.writeFile(path.join(tempExtractDir, MOCK_TOOL_NAME), 'binary content');

    mock.restore();

    const result = await setup.installer.installFromCurlTar(MOCK_TOOL_NAME, toolConfig, context);

    expect(setup.mocks.download).toHaveBeenCalledWith(
      'https://example.com/archive.tar.gz',
      expect.objectContaining({
        destinationPath: expect.stringContaining('test-tool.tar.gz'),
      })
    );

    expect(setup.fileSystemMocks.ensureDir).toHaveBeenCalled();
    // chmod should NOT be called for archive extraction (archives preserve permissions)
    expect(setup.fileSystemMocks.chmod).not.toHaveBeenCalled();
    // copyFile should be called to move binary from temp extract to final location
    expect(setup.fileSystemMocks.copyFile).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.info).toEqual({
      tarballUrl: 'https://example.com/archive.tar.gz',
    });
  });
});
