import { beforeEach, describe, expect, it } from 'bun:test';
import assert from 'node:assert';
import path from 'node:path';
import { InstallationPipeline } from '../utils/InstallationPipeline';
import { createArchivePipeline } from '../utils/stepFactories';
import {
  createInstallerTestSetup,
  createTestContext,
  type InstallerTestSetup,
  MOCK_TOOL_NAME,
  setupFileSystemMocks,
} from './installer-test-helpers';

describe('InstallationPipeline - CurlTar', () => {
  let setup: InstallerTestSetup;

  beforeEach(async () => {
    setup = await createInstallerTestSetup();
  });

  it('should install from curl tar using pipeline', async () => {
    const toolConfig = {
      name: MOCK_TOOL_NAME,
      binaries: [MOCK_TOOL_NAME],
      version: '1.0.0',
      installationMethod: 'curl-tar' as const,
      installParams: {
        url: 'https://example.com/test-tool.tar.gz',
      },
      configFilePath: '/test/config.ts',
    };

    const context = createTestContext(setup, {
      installDir: path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, '2024-08-13-16-45-23'),
    });

    setupFileSystemMocks(setup);

    // Create installation pipeline
    const pipeline = new InstallationPipeline(setup.logger);

    // Create steps for archive-based installation
    const steps = createArchivePipeline(
      'https://example.com/test-tool.tar.gz',
      'test-tool.tar.gz',
      MOCK_TOOL_NAME,
      toolConfig,
      setup.mocks.downloader,
      setup.mocks.archiveExtractor,
      setup.mocks.hookExecutor
    );

    // Execute pipeline
    const result = await pipeline.execute(MOCK_TOOL_NAME, toolConfig, context, setup.fs, undefined, steps);

    expect(result.success).toBe(true);
    assert(result.success);
    expect(result.binaryPaths).toBeDefined();
    expect(setup.mocks.downloader.download).toHaveBeenCalledWith(
      'https://example.com/test-tool.tar.gz',
      expect.objectContaining({
        destinationPath: expect.stringContaining('test-tool.tar.gz'),
      })
    );
    expect(setup.mocks.archiveExtractor.extract).toHaveBeenCalled();
  });
});
