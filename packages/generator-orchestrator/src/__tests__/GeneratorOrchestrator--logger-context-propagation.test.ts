/**
 * Integration tests for logger context propagation in the GeneratorOrchestrator.
 *
 * Verifies that tool name context flows through log messages during generation.
 * The GeneratorOrchestrator uses { context: toolName } to prefix logs with [toolName].
 */
import type { ProjectConfig } from '@dotfiles/config';
import { Architecture, type ISystemInfo, Platform, type ToolConfig } from '@dotfiles/core';
import { createMemFileSystem, type IFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { createMockFileRegistry, TrackedFileSystem } from '@dotfiles/registry/file';
import type { ICompletionGenerator, IShellInitGenerator } from '@dotfiles/shell-init-generator';
import type { IShimGenerator } from '@dotfiles/shim-generator';
import type { ISymlinkGenerator, SymlinkOperationResult } from '@dotfiles/symlink-generator';
import { createMockProjectConfig, createTestDirectories, type ITestDirectories } from '@dotfiles/testing-helpers';
import { beforeEach, describe, it, mock } from 'bun:test';
import path from 'node:path';
import { GeneratorOrchestrator } from '../GeneratorOrchestrator';

describe('GeneratorOrchestrator - Logger Context Propagation', () => {
  let mockShimGenerator: IShimGenerator;
  let mockShellInitGenerator: IShellInitGenerator;
  let mockSymlinkGenerator: ISymlinkGenerator;
  let mockCompletionGenerator: ICompletionGenerator;
  let mockFileSystem: IFileSystem;
  let mockProjectConfig: ProjectConfig;
  let orchestrator: GeneratorOrchestrator;
  let logger: TestLogger;
  let testDirs: ITestDirectories;
  let systemInfo: ISystemInfo;

  const TOOL_NAME = 'test-tool';

  beforeEach(async () => {
    mock.restore();
    logger = new TestLogger();

    mockShimGenerator = {
      generate: mock(async () => Promise.resolve([] as string[])),
      generateForTool: mock(async () => Promise.resolve([])),
    };
    mockShellInitGenerator = {
      generate: mock(async () =>
        Promise.resolve({
          files: new Map(),
          primaryPath: null,
        })
      ),
    };
    mockSymlinkGenerator = {
      generate: mock(async () => Promise.resolve([] as SymlinkOperationResult[])),
      createBinarySymlink: mock(async () => {}),
    };
    mockCompletionGenerator = {
      generateCompletionFile: mock(async () =>
        Promise.resolve({
          content: '# completion',
          filename: '_test-tool',
          targetPath: '/path/_test-tool',
          generatedBy: 'command' as const,
        })
      ),
      generateAndWriteCompletionFile: mock(async () =>
        Promise.resolve({
          content: '# completion',
          filename: '_test-tool',
          targetPath: '/path/_test-tool',
          generatedBy: 'command' as const,
        })
      ),
    };

    const { fs } = await createMemFileSystem({});
    mockFileSystem = fs;

    testDirs = await createTestDirectories(logger, mockFileSystem, { testName: 'generator-context' });

    systemInfo = { platform: Platform.Linux, arch: Architecture.X86_64, homeDir: testDirs.paths.homeDir };

    mockProjectConfig = await createMockProjectConfig({
      config: {
        paths: testDirs.paths,
      },
      filePath: path.join(testDirs.paths.dotfilesDir, 'config.yaml'),
      fileSystem: mockFileSystem,
      logger,
      systemInfo,
      env: {},
    });

    const mockFileRegistry = createMockFileRegistry();
    const trackedFs = new TrackedFileSystem(
      logger,
      mockFileSystem,
      mockFileRegistry,
      TrackedFileSystem.createContext('system', 'shim'),
      mockProjectConfig,
    );

    orchestrator = new GeneratorOrchestrator(
      logger,
      mockShimGenerator,
      mockShellInitGenerator,
      mockSymlinkGenerator,
      mockCompletionGenerator,
      systemInfo,
      mockProjectConfig,
      mockFileRegistry,
      mockFileSystem,
      trackedFs,
    );
  });

  it('should include tool context in cleanup logging when tool is disabled', async () => {
    const disabledToolConfig: ToolConfig = {
      name: TOOL_NAME,
      version: '1.0.0',
      installationMethod: 'github-release',
      installParams: { repo: 'owner/test-tool' },
      binaries: ['test-tool'],
      disabled: true,
    };

    const toolConfigs: Record<string, ToolConfig> = { [TOOL_NAME]: disabledToolConfig };

    await orchestrator.generateAll(toolConfigs);

    // The cleanupToolArtifacts method uses { context: toolName }
    logger.expect(['DEBUG'], ['GeneratorOrchestrator', 'cleanupToolArtifacts'], [TOOL_NAME], []);
  });

  it('should include tool context when generating completions', async () => {
    const toolConfig: ToolConfig = {
      name: TOOL_NAME,
      version: '1.0.0',
      installationMethod: 'github-release',
      installParams: { repo: 'owner/test-tool' },
      binaries: ['test-tool'],
      shellConfigs: {
        zsh: {
          completions: {
            cmd: 'test-tool completions zsh',
          },
        },
      },
    };

    // Create current directory so completion generation can find it
    const currentDir = path.join(mockProjectConfig.paths.binariesDir, TOOL_NAME, 'current');
    await mockFileSystem.mkdir(currentDir, { recursive: true });

    await orchestrator.generateCompletionsForTool(TOOL_NAME, toolConfig, '1.0.0');

    // The generateCompletionsForTool method uses .setPrefix(toolName)
    logger.expect(['INFO'], ['GeneratorOrchestrator', 'generateCompletionsForTool'], [TOOL_NAME], []);
  });
});
