import type { ProjectConfig } from '@dotfiles/config';
import type { IResolvedFileSystem, MockedFileSystem } from '@dotfiles/file-system';
import { createMemFileSystem } from '@dotfiles/file-system';
import { LogLevel, TestLogger } from '@dotfiles/logger';
import { createMockProjectConfig } from '@dotfiles/testing-helpers';
import { beforeEach, describe, expect, it } from 'bun:test';
import assert from 'node:assert';
import path from 'node:path';
import { z } from 'zod';
import { Architecture, type ISystemInfo, Platform } from '../../common';
import { createToolConfigContext } from '../createToolConfigContext';

describe('createToolConfigContext', () => {
  let projectConfig: ProjectConfig;
  let fileSystem: MockedFileSystem;
  let resolvedFs: IResolvedFileSystem;
  let logger: TestLogger;

  const systemInfo: ISystemInfo = {
    platform: Platform.MacOS,
    arch: Architecture.Arm64,
    homeDir: '/Users/testuser',
  };

  beforeEach(async () => {
    logger = new TestLogger({ minLevel: LogLevel.VERBOSE });
    const memFs = await createMemFileSystem();
    fileSystem = memFs.fs;
    resolvedFs = memFs.fs.asIResolvedFileSystem;
    await fileSystem.ensureDir('/test');

    projectConfig = await createMockProjectConfig({
      config: {
        paths: {
          homeDir: '/Users/testuser',
          dotfilesDir: '/Users/testuser/.dotfiles',
          generatedDir: '/Users/testuser/.dotfiles/.generated',
          targetDir: '/Users/testuser/.dotfiles/.generated/usr-local-bin',
          binariesDir: '/Users/testuser/.dotfiles/.generated/binaries',
          toolConfigsDir: '/Users/testuser/.dotfiles/configs/tools',
        },
      },
      filePath: '/test/config.yaml',
      fileSystem,
      logger,
      systemInfo,
      env: {},
    });
  });

  it('should expose currentDir and not expose legacy install directory key', () => {
    const toolName = 'test-tool';
    const toolDir = '/tmp/tools/test-tool';

    const context = createToolConfigContext(projectConfig, systemInfo, toolName, toolDir, resolvedFs, logger);

    const currentDirParsed = z.object({ currentDir: z.string() }).safeParse(context);
    expect(currentDirParsed.success).toBe(true);
    assert(currentDirParsed.success);

    const expectedCurrentDir = path.join(projectConfig.paths.binariesDir, toolName, 'current');
    expect(currentDirParsed.data.currentDir).toBe(expectedCurrentDir);

    const legacyKey = 'install' + 'Dir';
    const legacyShape: Record<string, z.ZodString> = { [legacyKey]: z.string() };
    const legacyParsed = z.object(legacyShape).safeParse(context);
    expect(legacyParsed.success).toBe(false);
  });

  it('should expose replaceInFile function that uses injected fileSystem', async () => {
    const toolName = 'test-tool';
    const toolDir = '/tmp/tools/test-tool';

    const context = createToolConfigContext(projectConfig, systemInfo, toolName, toolDir, resolvedFs, logger);

    expect(typeof context.replaceInFile).toBe('function');

    // Create a test file
    await fileSystem.ensureDir('/test/files');
    await fileSystem.writeFile('/test/files/config.txt', 'version=1\nname=test', 'utf8');

    // Use the context's replaceInFile with positional params
    await context.replaceInFile('/test/files/config.txt', /version=(\d+)/, 'version=2');

    const content = await fileSystem.readFile('/test/files/config.txt', 'utf8');
    expect(content).toBe('version=2\nname=test');
  });

  it('should return true when replaceInFile makes replacements', async () => {
    const toolName = 'test-tool';
    const toolDir = '/tmp/tools/test-tool';

    const context = createToolConfigContext(projectConfig, systemInfo, toolName, toolDir, resolvedFs, logger);

    await fileSystem.ensureDir('/test/files');
    await fileSystem.writeFile('/test/files/config.txt', 'foo bar foo', 'utf8');

    const wasReplaced: boolean = await context.replaceInFile('/test/files/config.txt', /foo/, 'baz');

    expect(wasReplaced).toBe(true);
  });

  it('should return false when replaceInFile finds no matches', async () => {
    const toolName = 'test-tool';
    const toolDir = '/tmp/tools/test-tool';

    const context = createToolConfigContext(projectConfig, systemInfo, toolName, toolDir, resolvedFs, logger);

    await fileSystem.ensureDir('/test/files');
    await fileSystem.writeFile('/test/files/config.txt', 'hello world', 'utf8');

    const wasReplaced: boolean = await context.replaceInFile('/test/files/config.txt', /does-not-exist/, 'replacement');

    expect(wasReplaced).toBe(false);
  });

  it('should log error with pattern and file when errorMessage provided and no matches found', async () => {
    const toolName = 'my-test-tool';
    const toolDir = '/tmp/tools/test-tool';
    const logger = new TestLogger({ minLevel: LogLevel.VERBOSE });

    const context = createToolConfigContext(projectConfig, systemInfo, toolName, toolDir, resolvedFs, logger);

    await fileSystem.ensureDir('/test/files');
    await fileSystem.writeFile('/test/files/config.txt', 'hello world', 'utf8');

    await context.replaceInFile('/test/files/config.txt', /does-not-exist/, 'replacement', {
      errorMessage: 'Could not find pattern in config file',
    });

    logger.expect(['ERROR'], [], [], ["Could not find 'does-not-exist' in /test/files/config.txt"]);
  });

  it('should not log error when errorMessage provided but matches found', async () => {
    const toolName = 'my-test-tool';
    const toolDir = '/tmp/tools/test-tool';
    const logger = new TestLogger({ minLevel: LogLevel.VERBOSE });

    const context = createToolConfigContext(projectConfig, systemInfo, toolName, toolDir, resolvedFs, logger);

    await fileSystem.ensureDir('/test/files');
    await fileSystem.writeFile('/test/files/config.txt', 'foo bar foo', 'utf8');

    await context.replaceInFile('/test/files/config.txt', /foo/, 'baz', {
      errorMessage: 'Could not find pattern',
    });

    // No error should be logged since matches were found
    expect(logger.logs.length).toBe(0);
  });

  it('should not log error when no errorMessage provided even if no matches', async () => {
    const toolName = 'my-test-tool';
    const toolDir = '/tmp/tools/test-tool';
    const logger = new TestLogger({ minLevel: LogLevel.VERBOSE });

    const context = createToolConfigContext(projectConfig, systemInfo, toolName, toolDir, resolvedFs, logger);

    await fileSystem.ensureDir('/test/files');
    await fileSystem.writeFile('/test/files/config.txt', 'hello world', 'utf8');

    await context.replaceInFile('/test/files/config.txt', /does-not-exist/, 'replacement');

    // No error should be logged since errorMessage wasn't provided
    expect(logger.logs.length).toBe(0);
  });

  describe('log property', () => {
    it('should expose log property with info, warn, error, debug, trace methods', () => {
      const toolName = 'test-tool';
      const toolDir = '/tmp/tools/test-tool';

      const context = createToolConfigContext(projectConfig, systemInfo, toolName, toolDir, resolvedFs, logger);

      expect(context.log).toBeDefined();
      expect(typeof context.log.info).toBe('function');
      expect(typeof context.log.warn).toBe('function');
      expect(typeof context.log.error).toBe('function');
      expect(typeof context.log.debug).toBe('function');
      expect(typeof context.log.trace).toBe('function');
    });

    it('should log info message with toolName context prefix', () => {
      const toolName = 'my-tool';
      const toolDir = '/tmp/tools/my-tool';

      const context = createToolConfigContext(projectConfig, systemInfo, toolName, toolDir, resolvedFs, logger);

      context.log.info('Installing dependencies');

      logger.expect(['INFO'], [], ['my-tool'], ['Installing dependencies']);
    });

    it('should log warn message with toolName context prefix', () => {
      const toolName = 'my-tool';
      const toolDir = '/tmp/tools/my-tool';

      const context = createToolConfigContext(projectConfig, systemInfo, toolName, toolDir, resolvedFs, logger);

      context.log.warn('Configuration file missing, using defaults');

      logger.expect(['WARN'], [], ['my-tool'], ['Configuration file missing, using defaults']);
    });

    it('should log error message with toolName context prefix', () => {
      const toolName = 'my-tool';
      const toolDir = '/tmp/tools/my-tool';

      const context = createToolConfigContext(projectConfig, systemInfo, toolName, toolDir, resolvedFs, logger);

      context.log.error('Failed to download asset');

      logger.expect(['ERROR'], [], ['my-tool'], ['Failed to download asset']);
    });

    it('should log error message with error object', () => {
      const toolName = 'my-tool';
      const toolDir = '/tmp/tools/my-tool';

      const context = createToolConfigContext(projectConfig, systemInfo, toolName, toolDir, resolvedFs, logger);
      const testError = new Error('Network timeout');

      context.log.error('Download failed', testError);

      // Should log the message with context and include the error
      logger.expect(['ERROR'], [], ['my-tool'], ['Download failed']);
    });

    it('should log debug message with toolName context prefix', () => {
      const toolName = 'my-tool';
      const toolDir = '/tmp/tools/my-tool';

      const context = createToolConfigContext(projectConfig, systemInfo, toolName, toolDir, resolvedFs, logger);

      context.log.debug('Extracting archive to staging directory');

      logger.expect(['DEBUG'], [], ['my-tool'], ['Extracting archive to staging directory']);
    });

    it('should log trace message with toolName context prefix', () => {
      const toolName = 'my-tool';
      const toolDir = '/tmp/tools/my-tool';

      const context = createToolConfigContext(projectConfig, systemInfo, toolName, toolDir, resolvedFs, logger);

      context.log.trace('Processing file: config.yaml');

      logger.expect(['TRACE'], [], ['my-tool'], ['Processing file: config.yaml']);
    });
  });
});
