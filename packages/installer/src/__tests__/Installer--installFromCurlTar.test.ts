import { beforeEach, describe, expect, it, mock } from 'bun:test';
import assert from 'node:assert';
import path from 'node:path';
import type { CurlTarToolConfig } from '@dotfiles/schemas';
import {
  createInstallerTestSetup,
  createTestContext,
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
      },
    };

    // The binary should be copied to the final location
    const installDir = path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, '2024-08-13-16-45-23');
    const context = createTestContext(setup, {
      installDir,
      toolConfig,
    });

    // The mock extractor will create files in the installDir, which is the timestamped directory
    // No need to manually create files - the mock extractor handles this

    mock.restore();

    const result = await setup.installer.installFromCurlTar(MOCK_TOOL_NAME, toolConfig, context);

    expect(setup.mocks.download).toHaveBeenCalledWith(
      'https://example.com/archive.tar.gz',
      expect.objectContaining({
        destinationPath: expect.stringContaining('test-tool.tar.gz'),
      })
    );

    expect(setup.fileSystemMocks.ensureDir).toHaveBeenCalled();
    // copyFile should NOT be called - we use symlinks now
    expect(setup.fileSystemMocks.copyFile).not.toHaveBeenCalled();
    // symlink should be called to create binary symlinks
    expect(setup.fileSystemMocks.symlink).toHaveBeenCalled();
    expect(result.success).toBe(true);
    assert(result.success);
    expect(result.metadata).toEqual({
      method: 'curl-tar',
      tarballUrl: 'https://example.com/archive.tar.gz',
    });
  });
});
