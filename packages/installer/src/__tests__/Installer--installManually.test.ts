import { beforeEach, describe, expect, it, type mock } from 'bun:test';
import assert from 'node:assert';
import path from 'node:path';
import {
  createInstallerTestSetup,
  createManualToolConfig,
  createTestContext,
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
    await setup.fs.ensureDir(path.dirname(manualBinaryPath));
    await setup.fs.writeFile(manualBinaryPath, 'manual binary content');

    const toolConfig = createManualToolConfig({
      installParams: {
        binaryPath: manualBinaryPath,
      },
    });

    const context = createTestContext(setup, {
      installDir: path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, 'unknown'),
      toolConfig,
    });

    const result = await setup.installer.installManually(MOCK_TOOL_NAME, toolConfig, context);

    expect(setup.fileSystemMocks.exists).toHaveBeenCalledWith(manualBinaryPath);
    expect(setup.fileSystemMocks.ensureDir).toHaveBeenCalled();
    expect(setup.fileSystemMocks.copyFile).toHaveBeenCalledWith(manualBinaryPath, expectedFinalPath);
    expect(setup.fileSystemMocks.chmod).not.toHaveBeenCalledWith();
    expect(result.success).toBe(true);
    assert(result.success);
    expect(result.binaryPaths).toEqual([expectedFinalPath]);
    expect(result.metadata).toEqual({
      method: 'manual',
      manualInstall: true,
      originalPath: manualBinaryPath,
    });
  });

  it('should return error if binary does not exist', async () => {
    (setup.fileSystemMocks.exists as ReturnType<typeof mock>).mockResolvedValue(false);
    const manualBinaryPath = '/usr/local/bin/non-existent-tool';
    const toolConfig = createManualToolConfig({
      installParams: {
        binaryPath: manualBinaryPath,
      },
    });

    const context = createTestContext(setup, {
      installDir: path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME),
      toolConfig,
    });

    const result = await setup.installer.installManually(MOCK_TOOL_NAME, toolConfig, context);

    expect(result.success).toBe(false);
    assert(!result.success);
    expect(result.error).toContain('Binary not found');
  });

  it('should succeed with configuration-only tool (no binaryPath)', async () => {
    const toolConfig = createManualToolConfig({
      installParams: {}, // No install params at all
      binaries: [], // No binaries specified
    });

    const context = createTestContext(setup, {
      installDir: path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, 'unknown'),
      toolConfig,
    });

    // Reset the mock after any setup calls
    setup.fileSystemMocks.exists.mockClear();

    const result = await setup.installer.installManually(MOCK_TOOL_NAME, toolConfig, context);

    expect(setup.fileSystemMocks.exists).not.toHaveBeenCalled();
    expect(setup.fileSystemMocks.copyFile).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    assert(result.success);
    expect(result.binaryPaths).toEqual([]);
    expect(result.metadata).toEqual({
      method: 'manual',
      manualInstall: true,
      originalPath: null,
    });
  });
});
