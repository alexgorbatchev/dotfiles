import { beforeEach, describe, expect, it } from 'bun:test';
import path from 'node:path';
import {
  createCurlScriptToolConfig,
  createInstallerTestSetup,
  createTestContext,
  type InstallerTestSetup,
  MOCK_TOOL_NAME,
  setupFileSystemMocks,
} from './installer-test-helpers';

describe('Installer - installFromCurlScript', () => {
  let setup: InstallerTestSetup;

  beforeEach(async () => {
    setup = await createInstallerTestSetup();
  });

  it('should download and execute script', async () => {
    const toolConfig = createCurlScriptToolConfig({
      installParams: {
        url: 'https://example.com/install.sh',
        shell: 'bash',
      },
    });

    const installDir = path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME);
    const scriptPath = path.join(installDir, `${MOCK_TOOL_NAME}-install.sh`);
    const assumedBinaryPath = path.join('/usr/local/bin', MOCK_TOOL_NAME);

    // Simulate the script being downloaded and the final binary being "created" by the script.
    await setup.fs.ensureDir(installDir); // Ensure parent directory exists
    await setup.fs.writeFile(scriptPath, '#!/bin/bash\necho "installed"');
    await setup.fs.ensureDir(path.dirname(assumedBinaryPath)); // Ensure parent for assumed binary
    await setup.fs.writeFile(assumedBinaryPath, 'binary content');

    // Setup filesystem mocks
    setupFileSystemMocks(setup);

    const context = createTestContext(setup, {
      installDir,
    });

    const result = await setup.installer.installFromCurlScript(MOCK_TOOL_NAME, toolConfig, context);

    expect(setup.mocks.download).toHaveBeenCalledWith(
      'https://example.com/install.sh',
      expect.objectContaining({
        destinationPath: expect.stringContaining('test-tool-install.sh'),
      })
    );

    expect(setup.fileSystemMocks.chmod).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.metadata).toEqual({
      method: 'curl-script',
      scriptUrl: 'https://example.com/install.sh',
      shell: 'bash',
    });
  });
});
