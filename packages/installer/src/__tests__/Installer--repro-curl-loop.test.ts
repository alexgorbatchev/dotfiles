import { beforeEach, describe, expect, it, spyOn } from 'bun:test';
import type { ToolConfig } from '@dotfiles/core';
import {
  createInstallerTestSetup,
  type IInstallerTestSetup,
  MOCK_TOOL_NAME,
} from './installer-test-helpers';
import path from 'node:path';

describe('Installer - Reproduction of curl-script loop issue', () => {
  let setup: IInstallerTestSetup;

  beforeEach(async () => {
    setup = await createInstallerTestSetup();
  });

  it('should create a new directory every time and NOT create a symlink for non-externally managed tools without version', async () => {
    const toolConfig: ToolConfig = {
      name: MOCK_TOOL_NAME,
      binaries: [MOCK_TOOL_NAME],
      version: 'latest',
      installationMethod: 'curl-script',
      installParams: {
        url: 'https://example.com/install.sh',
        shell: 'bash',
      },
    };

    // Mock plugin behavior for curl-script (no version returned)
    const binaryPath = path.join(setup.mockProjectConfig.paths.generatedDir, 'binaries', MOCK_TOOL_NAME, 'TIMESTAMP', MOCK_TOOL_NAME);
    
    // Create the binary file in mock FS so createBinarySymlinks doesn't fail
    await setup.fs.ensureDir(path.dirname(binaryPath));
    await setup.fs.writeFile(binaryPath, 'mock binary');
    await setup.fs.chmod(binaryPath, 0o755);

    const installSpy = spyOn(setup.pluginRegistry, 'install').mockResolvedValue({
      success: true,
      binaryPaths: [binaryPath],
      metadata: {
        method: 'curl-script',
        scriptUrl: 'https://example.com/install.sh',
        shell: 'bash',
      },
    });

    // First installation
    await setup.installer.install(MOCK_TOOL_NAME, toolConfig);

    // Check that ensureDir was called with a timestamped directory
    const ensureDirCalls1 = setup.fileSystemMocks.ensureDir.mock.calls;
    const installDirCall1 = ensureDirCalls1.find(
      (call) => call[0].includes(MOCK_TOOL_NAME) && call[0].match(/\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}/)
    );
    expect(installDirCall1).toBeDefined();
    // const installDir1 = installDirCall1![0];

    // Check that NO symlink was created at .../binaries/toolName/binaryName
    // The symlink path would be .../binaries/toolName/binaryName
    // The symlink target would be .../binaries/toolName/TIMESTAMP/binaryName
    // In Installer.ts, createExternalBinarySymlinks is ONLY called if isExternallyManaged is true.
    // curl-script is NOT externally managed.
    
    // We can check if symlink was called.
    const symlinkCalls = setup.fileSystemMocks.symlink.mock.calls;
    // We expect NO symlink calls for this tool in the binaries dir (except maybe inside the timestamp dir if the plugin did it, but here we mock the plugin)
    // The issue is about the symlink in the PARENT directory (toolDir).
    
    const toolDir = path.join(setup.mockProjectConfig.paths.generatedDir, 'binaries', MOCK_TOOL_NAME);
    const expectedSymlinkPath = path.join(toolDir, MOCK_TOOL_NAME);
    
    const symlinkCall = symlinkCalls.find(call => call[1] === expectedSymlinkPath);
    expect(symlinkCall).toBeDefined(); // Fixed: symlink IS created now
    expect(symlinkCall![0]).toBe(binaryPath); // Symlink points to the timestamped binary

    // Second installation
    // Now that we fixed the logic, it should SKIP installation because it's already installed (even if version is unknown/latest)
    // But wait, in the test setup, does toolInstallationRegistry know it's installed?
    // recordInstallation is called at the end of install().
    // So after first install, it should be recorded.
    
    // However, our mock toolInstallationRegistry might need to be updated to reflect the record call?
    // The default mock implementation:
    // recordToolInstallation: mock(async () => {}),
    // getToolInstallation: mock(),
    // isToolInstalled: mock(async () => false),
    
    // We need to update the mock to return the installation after the first call.
    setup.mockToolInstallationRegistry.getToolInstallation.mockImplementation(async () => {
        return {
            toolName: MOCK_TOOL_NAME,
            version: 'latest', // or whatever was recorded
            installPath: '/path/to/install',
            timestamp: '2024-01-01',
            binaryPaths: [],
        };
    });

    await setup.installer.install(MOCK_TOOL_NAME, toolConfig);

    // Expect installSpy to be called ONLY ONCE (for the first install)
    expect(installSpy).toHaveBeenCalledTimes(1);

    installSpy.mockRestore();
  });
});
