import type { IInstallerPlugin, ProjectConfig, ToolConfig } from '@dotfiles/core';
import { InstallerPluginRegistry } from '@dotfiles/core';
import { Downloader } from '@dotfiles/downloader';
import type { IFileSystem } from '@dotfiles/file-system';
import { createMemFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import type { IToolInstallationRecord, IToolInstallationRegistry } from '@dotfiles/registry';
import { createMockFileRegistry, type IFileRegistry, TrackedFileSystem } from '@dotfiles/registry/file';
import { FetchMockHelper } from '@dotfiles/testing-helpers';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ReadmeService } from '../ReadmeService';
import type { IReadmeContent } from '../types';

describe('ReadmeService', () => {
  let logger: TestLogger;
  let fileSystem: IFileSystem;
  let downloader: Downloader;
  let mockRegistry: IToolInstallationRegistry;
  let mockFileRegistry: IFileRegistry;
  let catalogFileSystem: TrackedFileSystem;
  let mockPluginRegistry: InstallerPluginRegistry;
  let readmeService: ReadmeService;
  let fetchMock: FetchMockHelper;

  const CACHE_DIR: string = '/cache/readme';

  beforeEach(async () => {
    logger = new TestLogger();
    const memFs = await createMemFileSystem({
      [CACHE_DIR]: {},
    });
    fileSystem = memFs.fs;

    fetchMock = new FetchMockHelper();
    fetchMock.setup();

    downloader = new Downloader(logger, fileSystem);

    mockRegistry = {
      getAllToolInstallations: mock(async () => []),
      getToolInstallation: mock(async () => null),
      recordToolInstallation: mock(async () => {}),
      updateToolInstallation: mock(async () => {}),
      removeToolInstallation: mock(async () => {}),
      isToolInstalled: mock(async () => false),
      close: mock(async () => {}),
    };

    mockFileRegistry = createMockFileRegistry();

    // Create mock plugin registry with a GitHub release plugin
    mockPluginRegistry = new InstallerPluginRegistry(logger);
    const mockGitHubPlugin: Partial<IInstallerPlugin> = {
      method: 'github-release',
      supportsReadme: () => true,
      getReadmeUrl: () => 'https://raw.githubusercontent.com/owner/repo/main/README.md',
    };
    await mockPluginRegistry.register(mockGitHubPlugin as IInstallerPlugin);

    // Create mock project config
    const mockProjectConfig: ProjectConfig = {
      paths: {
        homeDir: '/home/test',
        dotfilesDir: '/home/test/.dotfiles',
        targetDir: '/home/test',
        generatedDir: '/home/test/.generated',
        toolConfigsDir: '/home/test/.dotfiles/tools',
        shellScriptsDir: '/home/test/.generated/shell-scripts',
        binariesDir: '/home/test/.generated/binaries',
      },
    } as ProjectConfig;

    // Create real TrackedFileSystem
    catalogFileSystem = new TrackedFileSystem(
      logger,
      fileSystem,
      mockFileRegistry,
      TrackedFileSystem.createContext('readme-service', 'catalog'),
      mockProjectConfig,
    );

    readmeService = new ReadmeService(
      logger,
      downloader,
      mockRegistry,
      fileSystem,
      catalogFileSystem,
      CACHE_DIR,
      mockPluginRegistry,
    );
  });

  afterEach(() => {
    fetchMock.restore();
  });

  describe('fetchReadmeForVersion', () => {
    test('should fetch README from GitHub raw URL', async () => {
      const readmeContent: string = '# Test Tool\n\nThis is a test tool description.';
      fetchMock.mockTextResponseOnce(readmeContent);

      const result: IReadmeContent | null = await readmeService.fetchReadmeForVersion(
        'owner',
        'repo',
        'v1.0.0',
        'test-tool',
      );

      expect(result).not.toBeNull();
      expect(result!.content).toBe(readmeContent);
      expect(result!.owner).toBe('owner');
      expect(result!.repo).toBe('repo');
      expect(result!.version).toBe('v1.0.0');
      expect(result!.toolName).toBe('test-tool');
      expect(result!.sourceUrl).toBe('https://raw.githubusercontent.com/owner/repo/v1.0.0/README.md');
      expect(fetchMock.getSpy()).toHaveBeenCalledWith(
        'https://raw.githubusercontent.com/owner/repo/v1.0.0/README.md',
        expect.any(Object),
      );
    });

    test('should return null when README not found', async () => {
      fetchMock.mockErrorOnce(new Error('Not Found'));

      const result: IReadmeContent | null = await readmeService.fetchReadmeForVersion(
        'owner',
        'repo',
        'v1.0.0',
        'test-tool',
      );

      expect(result).toBeNull();
    });

    test('should cache README content after fetching', async () => {
      const readmeContent: string = '# Test Tool\n\nThis is a test tool description.';
      fetchMock.mockTextResponseOnce(readmeContent);

      // First call should fetch from network
      const result1: IReadmeContent | null = await readmeService.fetchReadmeForVersion(
        'owner',
        'repo',
        'v1.0.0',
        'test-tool',
      );

      // Second call should use cache
      const result2: IReadmeContent | null = await readmeService.fetchReadmeForVersion(
        'owner',
        'repo',
        'v1.0.0',
        'test-tool',
      );

      expect(result1).toEqual(result2);
      expect(fetchMock.getSpy()).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCachedReadme', () => {
    test('should return null for non-cached README', async () => {
      const result: IReadmeContent | null = await readmeService.getCachedReadme('owner', 'repo', 'v1.0.0');
      expect(result).toBeNull();
    });

    test('should return cached README if available', async () => {
      const readmeContent: string = '# Test Tool\n\nThis is a test tool description.';
      fetchMock.mockTextResponseOnce(readmeContent);

      // First, cache the README
      await readmeService.fetchReadmeForVersion('owner', 'repo', 'v1.0.0', 'test-tool');

      // Then retrieve from cache
      const result: IReadmeContent | null = await readmeService.getCachedReadme('owner', 'repo', 'v1.0.0');

      expect(result).not.toBeNull();
      expect(result!.content).toBe(readmeContent);
    });
  });

  describe('getGitHubTools', () => {
    test('should return empty array when no tools installed', async () => {
      const tools = await readmeService.getGitHubTools();
      expect(tools).toEqual([]);
    });

    test('should filter and return GitHub tools', async () => {
      const mockInstallations: IToolInstallationRecord[] = [
        {
          id: 1,
          toolName: 'github-tool',
          version: '1.0.0',
          installPath: '/usr/local/bin/github-tool',
          timestamp: '2023-01-01',
          installedAt: new Date(),
          binaryPaths: ['/usr/local/bin/github-tool'],
          downloadUrl: 'https://github.com/owner/repo/releases/download/v1.0.0/tool.tar.gz',
        },
        {
          id: 2,
          toolName: 'non-github-tool',
          version: '2.0.0',
          installPath: '/usr/local/bin/other-tool',
          timestamp: '2023-01-01',
          installedAt: new Date(),
          binaryPaths: ['/usr/local/bin/other-tool'],
          downloadUrl: 'https://example.com/tool.tar.gz',
        },
      ];

      (mockRegistry.getAllToolInstallations as ReturnType<typeof mock>).mockResolvedValueOnce(mockInstallations);

      const tools = await readmeService.getGitHubTools();

      expect(tools).toHaveLength(1);
      expect(tools[0]!.toolName).toBe('github-tool');
      expect(tools[0]!.downloadUrl).toContain('github.com/owner/repo');
    });
  });

  describe('generateCombinedReadme', () => {
    test('should generate README with no tools', async () => {
      const result: string = await readmeService.generateCombinedReadme();

      expect(result).toContain('# Installed Tools');
      expect(result).toContain('No GitHub tools are currently installed.');
    });

    test('should generate combined README for multiple tools', async () => {
      const mockInstallations: IToolInstallationRecord[] = [
        {
          id: 1,
          toolName: 'tool1',
          version: '1.0.0',
          installPath: '/usr/local/bin/tool1',
          timestamp: '2023-01-01',
          installedAt: new Date(),
          binaryPaths: ['/usr/local/bin/tool1'],
          downloadUrl: 'https://github.com/owner1/repo1/releases/download/v1.0.0/tool.tar.gz',
        },
        {
          id: 2,
          toolName: 'tool2',
          version: '2.0.0',
          installPath: '/usr/local/bin/tool2',
          timestamp: '2023-01-01',
          installedAt: new Date(),
          binaryPaths: ['/usr/local/bin/tool2'],
          downloadUrl: 'https://github.com/owner2/repo2/releases/download/v2.0.0/tool.tar.gz',
        },
      ];

      (mockRegistry.getAllToolInstallations as ReturnType<typeof mock>).mockResolvedValueOnce(mockInstallations);

      fetchMock.mockTextResponseOnce('# Tool 1\n\nFirst tool description.');
      fetchMock.mockTextResponseOnce('# Tool 2\n\nSecond tool description.');

      const result: string = await readmeService.generateCombinedReadme();

      expect(result).toContain('# Installed Tools');
      expect(result).toContain('## Table of Contents');
      expect(result).toContain('## tool1 (1.0.0)');
      expect(result).toContain('## tool2 (2.0.0)');
      expect(result).toContain('First tool description.');
      expect(result).toContain('Second tool description.');
    });

    test('should handle missing READMEs gracefully', async () => {
      const mockInstallations: IToolInstallationRecord[] = [
        {
          id: 1,
          toolName: 'tool1',
          version: '1.0.0',
          installPath: '/usr/local/bin/tool1',
          timestamp: '2023-01-01',
          installedAt: new Date(),
          binaryPaths: ['/usr/local/bin/tool1'],
          downloadUrl: 'https://github.com/owner1/repo1/releases/download/v1.0.0/tool.tar.gz',
        },
      ];

      (mockRegistry.getAllToolInstallations as ReturnType<typeof mock>).mockResolvedValueOnce(mockInstallations);
      fetchMock.mockErrorOnce(new Error('Not Found'));

      const result: string = await readmeService.generateCombinedReadme();

      expect(result).toContain('## tool1 (1.0.0)');
      expect(result).toContain('*README not available*');
      expect(result).toContain('[owner1/repo1](https://github.com/owner1/repo1)');
    });

    test('should include full README content', async () => {
      const mockInstallations: IToolInstallationRecord[] = [
        {
          id: 1,
          toolName: 'tool1',
          version: '1.0.0',
          installPath: '/usr/local/bin/tool1',
          timestamp: '2023-01-01',
          installedAt: new Date(),
          binaryPaths: ['/usr/local/bin/tool1'],
          downloadUrl: 'https://github.com/owner1/repo1/releases/download/v1.0.0/tool.tar.gz',
        },
      ];

      (mockRegistry.getAllToolInstallations as ReturnType<typeof mock>).mockResolvedValueOnce(mockInstallations);
      fetchMock.mockTextResponseOnce(
        '# Tool 1\n\nThis is the full description of the tool with all its details and documentation.',
      );

      const result: string = await readmeService.generateCombinedReadme();

      expect(result).toContain(
        '# Tool 1\n\nThis is the full description of the tool with all its details and documentation.',
      );
    });
  });

  describe('clearExpiredCache', () => {
    test('should clear expired cache entries', async () => {
      // Should not throw, should handle gracefully
      await readmeService.clearExpiredCache();
      // Just verify it completes without error
    });
  });

  describe('writeReadmeToPath', () => {
    test('should write README to organized path structure', async () => {
      const readmeContent: string = '# Test Tool\n\nThis is a test tool description.';
      fetchMock.mockTextResponseOnce(readmeContent);

      const result: string | null = await readmeService.writeReadmeToPath(
        '/output',
        'test-tool',
        'v1.0.0',
        'owner',
        'repo',
      );

      expect(result).toBe('/output/test-tool/v1.0.0/README.md');

      // Verify file was written
      const writtenContent: string = await fileSystem.readFile('/output/test-tool/v1.0.0/README.md');
      expect(writtenContent).toBe(readmeContent);
    });

    test('should return null when README not available', async () => {
      fetchMock.mockErrorOnce(new Error('Not Found'));

      const result: string | null = await readmeService.writeReadmeToPath(
        '/output',
        'test-tool',
        'v1.0.0',
        'owner',
        'repo',
      );

      expect(result).toBeNull();
    });

    test('should handle file write errors gracefully', async () => {
      const readmeContent: string = '# Test Tool\n\nThis is a test tool description.';
      fetchMock.mockTextResponseOnce(readmeContent);

      // Mock file system to throw error on writeFile
      const originalWriteFile = fileSystem.writeFile;
      fileSystem.writeFile = mock(async () => {
        throw new Error('Write permission denied');
      });

      const result: string | null = await readmeService.writeReadmeToPath(
        '/output',
        'test-tool',
        'v1.0.0',
        'owner',
        'repo',
      );

      expect(result).toBeNull();

      // Restore original method
      fileSystem.writeFile = originalWriteFile;
    });

    test('should create nested directory structure', async () => {
      const readmeContent: string = '# Test Tool\n\nThis is a test tool description.';
      fetchMock.mockTextResponseOnce(readmeContent);

      await readmeService.writeReadmeToPath('/output', 'test-tool', 'v1.0.0', 'owner', 'repo');

      // Verify directory structure was created
      expect(await fileSystem.exists('/output/test-tool')).toBe(true);
      expect(await fileSystem.exists('/output/test-tool/v1.0.0')).toBe(true);
      expect(await fileSystem.exists('/output/test-tool/v1.0.0/README.md')).toBe(true);
    });
  });

  describe('generateCatalogFromConfigs', () => {
    test('should warn and return null when no GitHub tools are installed', async () => {
      const toolConfigs: Record<string, ToolConfig> = {
        'manual-tool': {
          name: 'manual-tool',
          installationMethod: 'manual',
          binaries: ['manual-tool'],
        } as ToolConfig,
      };

      const result: string | null = await readmeService.generateCatalogFromConfigs('/catalog/CATALOG.md', toolConfigs);

      expect(result).toBeNull();
      logger.expect(
        ['WARN'],
        ['ReadmeService'],
        [],
        ['No GitHub tools installed. Run the generate command to install tools before generating a catalog.'],
      );
    });

    test('should generate catalog for GitHub tools', async () => {
      const toolConfigs: Record<string, ToolConfig> = {
        'test-tool': {
          name: 'test-tool',
          installationMethod: 'github-release',
          version: 'v1.0.0',
          binaries: ['test-tool'],
          installParams: {
            repo: 'owner/repo',
          },
        } as ToolConfig,
      };

      // Mock registry to return installed GitHub tools
      const installedTool: IToolInstallationRecord = {
        id: 1,
        toolName: 'test-tool',
        version: 'v1.0.0',
        installPath: '/tools/test-tool',
        timestamp: new Date().toISOString(),
        installedAt: new Date(),
        binaryPaths: ['/bin/test-tool'],
        downloadUrl: 'https://github.com/owner/repo/releases/download/v1.0.0/test-tool.tar.gz',
        assetName: 'test-tool.tar.gz',
      };
      mockRegistry.getAllToolInstallations = mock(async () => [installedTool]);

      fetchMock.mockTextResponseOnce('# Test Tool\n\nThis is a test tool.');

      const result: string | null = await readmeService.generateCatalogFromConfigs('/catalog/CATALOG.md', toolConfigs);

      expect(result).toBe('/catalog/CATALOG.md');

      const catalogContent: string = await catalogFileSystem.readFile('/catalog/CATALOG.md');
      expect(catalogContent).toContain('# Tool Catalog');
      expect(catalogContent).toContain('## test-tool');
      expect(catalogContent).toContain('This is a test tool.');
    });
  });
});
