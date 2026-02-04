import type { IConfigService } from '@dotfiles/config';
import type { ToolConfig } from '@dotfiles/core';
import { createMemFileSystem, type IResolvedFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { RegistryDatabase } from '@dotfiles/registry-database';
import { FileRegistry } from '@dotfiles/registry/file';
import { ToolInstallationRegistry } from '@dotfiles/registry/tool';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import {
  createMockConfigService,
  createMockProjectConfig,
  createMockSystemInfo,
  createMockToolConfig,
  createMockVersionChecker,
} from '../../testing-helpers';
import { clearToolConfigsCache, createApiRoutes } from '../routes';
import type { IDashboardServices } from '../types';

describe('Dashboard API Routes', () => {
  let logger: TestLogger;
  let registryDatabase: RegistryDatabase;
  let fileRegistry: FileRegistry;
  let toolInstallationRegistry: ToolInstallationRegistry;
  let services: IDashboardServices;
  let api: ReturnType<typeof createApiRoutes>;
  let fs: IResolvedFileSystem;
  let toolConfigs: Record<string, ToolConfig>;
  let configService: IConfigService;

  beforeEach(async () => {
    clearToolConfigsCache();
    logger = new TestLogger();
    registryDatabase = new RegistryDatabase(logger, ':memory:');
    const db = registryDatabase.getConnection();
    fileRegistry = new FileRegistry(logger, db);
    toolInstallationRegistry = new ToolInstallationRegistry(logger, db);

    const memFs = await createMemFileSystem();
    fs = memFs.fs.asIResolvedFileSystem;

    toolConfigs = {};
    configService = createMockConfigService(toolConfigs);

    services = {
      projectConfig: createMockProjectConfig(),
      fs,
      configService,
      systemInfo: createMockSystemInfo(),
      fileRegistry,
      toolInstallationRegistry,
      versionChecker: createMockVersionChecker(),
    };

    api = createApiRoutes(logger, services);
  });

  afterEach(async () => {
    registryDatabase.close();
  });

  describe('getTools', () => {
    test('returns empty array when no tool configs', async () => {
      const result = await api.getTools();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    test('returns tool details from config with not-installed status', async () => {
      toolConfigs['fzf'] = createMockToolConfig({
        name: 'fzf',
        version: 'latest',
        installationMethod: 'github-release',
        installParams: { repo: 'junegunn/fzf' },
        binaries: ['fzf'],
      });

      const result = await api.getTools();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data?.[0]?.config.name).toBe('fzf');
      expect(result.data?.[0]?.config.installationMethod).toBe('github-release');
      expect(result.data?.[0]?.runtime.status).toBe('not-installed');
    });

    test('returns tool details with installed status when registry has record', async () => {
      toolConfigs['fzf'] = createMockToolConfig({
        name: 'fzf',
        version: 'latest',
        installationMethod: 'github-release',
        installParams: { repo: 'junegunn/fzf' },
        binaries: ['fzf'],
      });

      await toolInstallationRegistry.recordToolInstallation({
        toolName: 'fzf',
        version: '0.55.0',
        installPath: '/binaries/fzf/2025-01-01',
        timestamp: '2025-01-01-00-00-00',
        binaryPaths: ['/binaries/fzf/fzf'],
        downloadUrl: 'https://github.com/junegunn/fzf/releases/download/v0.55.0/fzf-0.55.0-darwin_arm64.tar.gz',
      });

      const result = await api.getTools();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data?.[0]?.config.name).toBe('fzf');
      expect(result.data?.[0]?.runtime.status).toBe('installed');
      expect(result.data?.[0]?.runtime.installedVersion).toBe('0.55.0');
    });

    test('returns tool details with files', async () => {
      toolConfigs['fzf'] = createMockToolConfig({
        name: 'fzf',
        version: 'latest',
        installationMethod: 'github-release',
        installParams: { repo: 'junegunn/fzf' },
        binaries: ['fzf'],
      });

      await fileRegistry.recordOperation({
        toolName: 'fzf',
        operationType: 'writeFile',
        filePath: '/bin/fzf',
        fileType: 'shim',
        operationId: randomUUID(),
      });

      const result = await api.getTools();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data?.[0]?.config.name).toBe('fzf');
      expect(result.data?.[0]?.files).toHaveLength(1);
      expect(result.data?.[0]?.files?.[0]?.filePath).toBe('/bin/fzf');
    });
  });

  describe('getStats', () => {
    test('returns stats for empty registry', async () => {
      const result = await api.getStats();

      expect(result.success).toBe(true);
      expect(result.data?.toolsInstalled).toBe(0);
      expect(result.data?.filesTracked).toBe(0);
      expect(result.data?.totalOperations).toBe(0);
    });

    test('returns stats with installed tools and files', async () => {
      await toolInstallationRegistry.recordToolInstallation({
        toolName: 'bat',
        version: '0.24.0',
        installPath: '/binaries/bat/2025-01-01',
        timestamp: '2025-01-01-00-00-00',
        binaryPaths: ['/binaries/bat/bat'],
      });

      await fileRegistry.recordOperation({
        toolName: 'bat',
        operationType: 'writeFile',
        filePath: '/bin/bat',
        fileType: 'shim',
        operationId: randomUUID(),
      });

      const result = await api.getStats();

      expect(result.success).toBe(true);
      expect(result.data?.toolsInstalled).toBe(1);
      expect(result.data?.filesTracked).toBe(1);
      expect(result.data?.totalOperations).toBe(1);
    });
  });

  describe('getHealth', () => {
    test('returns healthy status for valid registry', async () => {
      const result = await api.getHealth();

      expect(result.success).toBe(true);
      expect(result.data?.overall).toBeDefined();
      expect(result.data?.checks).toHaveLength(2);
      expect(result.data?.lastCheck).toBeDefined();
    });
  });

  describe('getConfig', () => {
    test('returns configuration summary', async () => {
      const result = await api.getConfig();

      expect(result.success).toBe(true);
      expect(result.data?.dotfilesDir).toBe('/home/user/.dotfiles');
      expect(result.data?.generatedDir).toBe('/home/user/.dotfiles/.generated');
      expect(result.data?.binariesDir).toBe('/home/user/.dotfiles/.generated/binaries');
    });
  });

  describe('getShellIntegration', () => {
    test('returns empty shell integration when no shell files exist', async () => {
      const result = await api.getShellIntegration();

      expect(result.success).toBe(true);
      expect(result.data?.completions).toEqual([]);
      expect(result.data?.initScripts).toEqual([]);
      expect(result.data?.totalFiles).toBe(0);
    });

    test('returns completions grouped by tool', async () => {
      await fileRegistry.recordOperation({
        toolName: 'fzf',
        operationType: 'writeFile',
        filePath: '/home/user/.dotfiles/.generated/completions/_fzf',
        fileType: 'completion',
        operationId: randomUUID(),
      });

      await fileRegistry.recordOperation({
        toolName: 'bat',
        operationType: 'writeFile',
        filePath: '/home/user/.dotfiles/.generated/completions/_bat',
        fileType: 'completion',
        operationId: randomUUID(),
      });

      const result = await api.getShellIntegration();

      expect(result.success).toBe(true);
      expect(result.data?.completions).toHaveLength(2);
      expect(result.data?.completions.map((c: { toolName: string; }) => c.toolName).toSorted()).toEqual(['bat', 'fzf']);
    });

    test('returns init scripts grouped by tool', async () => {
      await fileRegistry.recordOperation({
        toolName: 'starship',
        operationType: 'writeFile',
        filePath: '/home/user/.dotfiles/.generated/shell-scripts/starship.zsh',
        fileType: 'init',
        operationId: randomUUID(),
      });

      const result = await api.getShellIntegration();

      expect(result.success).toBe(true);
      expect(result.data?.initScripts).toHaveLength(1);
      expect(result.data?.initScripts[0]?.toolName).toBe('starship');
      expect(result.data?.initScripts[0]?.filePath).toBe('/home/user/.dotfiles/.generated/shell-scripts/starship.zsh');
    });

    test('calculates total shell files correctly', async () => {
      await fileRegistry.recordOperation({
        toolName: 'fzf',
        operationType: 'writeFile',
        filePath: '/completions/_fzf',
        fileType: 'completion',
        operationId: randomUUID(),
      });

      await fileRegistry.recordOperation({
        toolName: 'fzf',
        operationType: 'writeFile',
        filePath: '/shell-scripts/fzf.zsh',
        fileType: 'init',
        operationId: randomUUID(),
      });

      await fileRegistry.recordOperation({
        toolName: 'bat',
        operationType: 'writeFile',
        filePath: '/completions/_bat',
        fileType: 'completion',
        operationId: randomUUID(),
      });

      const result = await api.getShellIntegration();

      expect(result.success).toBe(true);
      expect(result.data?.totalFiles).toBe(3);
      expect(result.data?.completions).toHaveLength(2);
      expect(result.data?.initScripts).toHaveLength(1);
    });
  });

  describe('getActivity', () => {
    test('returns empty activity when no operations exist', async () => {
      const result = await api.getActivity();

      expect(result.success).toBe(true);
      expect(result.data?.activities).toEqual([]);
      expect(result.data?.totalCount).toBe(0);
    });

    test('returns recent operations as activity items', async () => {
      await fileRegistry.recordOperation({
        toolName: 'fzf',
        operationType: 'writeFile',
        filePath: '/bin/fzf',
        fileType: 'shim',
        operationId: randomUUID(),
      });

      await toolInstallationRegistry.recordToolInstallation({
        toolName: 'fzf',
        version: '0.55.0',
        installPath: '/binaries/fzf/2025-01-01',
        timestamp: '2025-01-01-00-00-00',
        binaryPaths: ['/binaries/fzf/fzf'],
      });

      const result = await api.getActivity();

      expect(result.success).toBe(true);
      expect(result.data?.activities.length).toBeGreaterThan(0);
    });

    test('returns activities with relative timestamps', async () => {
      await fileRegistry.recordOperation({
        toolName: 'bat',
        operationType: 'writeFile',
        filePath: '/bin/bat',
        fileType: 'shim',
        operationId: randomUUID(),
      });

      const result = await api.getActivity();

      expect(result.success).toBe(true);
      expect(result.data?.activities[0]?.relativeTime).toBeDefined();
    });

    test('limits activities to specified count', async () => {
      for (let i = 0; i < 10; i++) {
        await fileRegistry.recordOperation({
          toolName: `tool-${i}`,
          operationType: 'writeFile',
          filePath: `/bin/tool-${i}`,
          fileType: 'shim',
          operationId: randomUUID(),
        });
      }

      const result = await api.getActivity(5);

      expect(result.success).toBe(true);
      expect(result.data?.activities).toHaveLength(5);
      expect(result.data?.totalCount).toBe(10);
    });

    test('orders activities by most recent first', async () => {
      await fileRegistry.recordOperation({
        toolName: 'first',
        operationType: 'writeFile',
        filePath: '/bin/first',
        fileType: 'shim',
        operationId: randomUUID(),
      });

      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      await fileRegistry.recordOperation({
        toolName: 'second',
        operationType: 'writeFile',
        filePath: '/bin/second',
        fileType: 'shim',
        operationId: randomUUID(),
      });

      const result = await api.getActivity();

      expect(result.success).toBe(true);
      expect(result.data?.activities[0]?.toolName).toBe('second');
      expect(result.data?.activities[1]?.toolName).toBe('first');
    });
  });
});
