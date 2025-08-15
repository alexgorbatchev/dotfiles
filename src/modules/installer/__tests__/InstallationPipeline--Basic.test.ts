import { beforeEach, describe, expect, it, mock } from 'bun:test';
import path from 'node:path';
import type { BaseInstallContext } from '@types';
import { InstallationPipeline } from '../InstallationPipeline';
import { createDownloadStep, createExtractStep } from '../utils/stepFactories';
import {
  createInstallerTestSetup,
  type InstallerTestSetup,
  MOCK_TOOL_NAME,
  MOCK_TOOL_VERSION,
} from './installer-test-helpers';

describe('InstallationPipeline - Basic Steps', () => {
  let setup: InstallerTestSetup;

  beforeEach(async () => {
    setup = await createInstallerTestSetup();
  });

  it('should execute download and extract steps', async () => {
    const toolConfig = {
      name: MOCK_TOOL_NAME,
      binaries: [MOCK_TOOL_NAME],
      version: MOCK_TOOL_VERSION,
      installationMethod: 'curl-tar' as const,
      installParams: {
        url: 'https://example.com/test-tool.tar.gz',
      },
      configFilePath: '/test/config.ts',
    };

    const installDir = path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, '2024-08-13-16-45-23');
    const context: BaseInstallContext = {
      toolName: MOCK_TOOL_NAME,
      installDir,
      timestamp: '2024-08-13-16-45-23',
      systemInfo: { platform: 'linux', arch: 'x64', homeDir: setup.testDirs.paths.homeDir },
      toolConfig,
      appConfig: setup.mockAppConfig,
    };

    mock.restore();

    // Create simple pipeline with just download and extract
    const pipeline = new InstallationPipeline(setup.logger);
    const steps = [
      createDownloadStep('https://example.com/test-tool.tar.gz', 'test-tool.tar.gz', setup.mocks.downloader),
      createExtractStep(setup.mocks.archiveExtractor),
    ];

    const result = await pipeline.execute(MOCK_TOOL_NAME, toolConfig, context, setup.fs, undefined, steps);

    expect(result.success).toBe(true);
    expect(setup.mocks.downloader.download).toHaveBeenCalledWith(
      'https://example.com/test-tool.tar.gz',
      expect.objectContaining({
        destinationPath: expect.stringContaining('test-tool.tar.gz'),
      })
    );
    expect(setup.mocks.archiveExtractor.extract).toHaveBeenCalled();
  });
});
