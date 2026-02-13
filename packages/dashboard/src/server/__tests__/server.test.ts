import type { IConfigService } from '@dotfiles/config';
import type { ToolConfig } from '@dotfiles/core';
import { createMemFileSystem, type IResolvedFileSystem } from '@dotfiles/file-system';
import type { IInstaller } from '@dotfiles/installer';
import { TestLogger } from '@dotfiles/logger';
import { RegistryDatabase } from '@dotfiles/registry-database';
import { FileRegistry } from '@dotfiles/registry/file';
import { ToolInstallationRegistry } from '@dotfiles/registry/tool';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  createMockConfigService,
  createMockProjectConfig,
  createMockSystemInfo,
  createMockToolConfig,
  createMockVersionChecker,
} from '../../testing-helpers';
import { createDashboardServer } from '../dashboard-server';
import { clearToolConfigsCache } from '../routes';
import type { IDashboardServices } from '../types';

describe('Dashboard HTTP Server', () => {
  let logger: TestLogger;
  let registryDatabase: RegistryDatabase;
  let fileRegistry: FileRegistry;
  let toolInstallationRegistry: ToolInstallationRegistry;
  let services: IDashboardServices;
  let server: ReturnType<typeof createDashboardServer>;
  let baseUrl: string;
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
      downloader: {
        registerStrategy: () => {},
        download: async () => undefined,
        downloadToFile: async () => {},
      },
      installer: {
        install: async () => ({ success: true as const, version: '1.0.0', installationMethod: 'github-release' }),
      } as unknown as IInstaller,
    };

    // Use random port to avoid conflicts
    const port = 10000 + Math.floor(Math.random() * 50000);
    server = createDashboardServer(logger, services, { port, host: 'localhost' });
    await server.start();
    baseUrl = server.getUrl();
  });

  afterEach(async () => {
    await server.stop();
    registryDatabase.close();
  });

  describe('GET /api/health', () => {
    test('includes registry and tool checks', async () => {
      const response = await fetch(`${baseUrl}/api/health`);
      const data = await response.json();

      const checkNames = data.data.checks.map((c: { name: string; }) => c.name);
      expect(checkNames).toContain('Registry Integrity');
      expect(checkNames).toContain('Tool Installations');
    });
  });

  describe('Unknown API routes', () => {
    test('returns 404 for unknown API endpoint', async () => {
      const response = await fetch(`${baseUrl}/api/unknown`);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Not found');
    });
  });

  describe('SPA routing', () => {
    test('returns HTML for root path', async () => {
      const response = await fetch(`${baseUrl}/`);
      const text = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('text/html');
      expect(text).toContain('<!DOCTYPE html>');
      expect(text).toContain('Dotfiles Dashboard');
    });

    test('returns HTML for SPA routes', async () => {
      const routes = ['/tools', '/tools/fzf', '/files', '/health', '/settings'];

      for (const route of routes) {
        const response = await fetch(`${baseUrl}${route}`);
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toContain('text/html');
      }
    });
  });

  describe('Server lifecycle', () => {
    test('returns correct URL', () => {
      expect(server.getUrl()).toMatch(/^http:\/\/localhost:\d+$/);
    });

    test('can stop and restart', async () => {
      await server.stop();

      // Should throw or fail to connect after stop
      let errorOccurred = false;
      try {
        await fetch(`${baseUrl}/api/health`);
      } catch {
        errorOccurred = true;
      }
      expect(errorOccurred).toBe(true);

      // Restart
      await server.start();
      const response = await fetch(`${baseUrl}/api/health`);
      expect(response.status).toBe(200);
    });
  });

  describe('Health check integration', () => {
    test('health check shows warning when no tools installed', async () => {
      const response = await fetch(`${baseUrl}/api/health`);
      const data = await response.json();

      expect(data.success).toBe(true);
      const toolCheck = data.data.checks.find((c: { name: string; }) => c.name === 'Tool Installations');
      expect(toolCheck.status).toBe('warn');
      expect(toolCheck.message).toContain('0 tool');
    });

    test('health check shows pass when tools are installed', async () => {
      await toolInstallationRegistry.recordToolInstallation({
        toolName: 'fzf',
        version: '0.55.0',
        installPath: '/binaries/fzf/2025-01-01',
        timestamp: '2025-01-01-00-00-00',
        binaryPaths: ['/binaries/fzf/fzf'],
      });

      const response = await fetch(`${baseUrl}/api/health`);
      const data = await response.json();

      const toolCheck = data.data.checks.find((c: { name: string; }) => c.name === 'Tool Installations');
      expect(toolCheck.status).toBe('pass');
      expect(toolCheck.message).toContain('1 tool');
    });

    test('health check does not include unused binaries when none exist', async () => {
      const response = await fetch(`${baseUrl}/api/health`);
      const data = await response.json();

      const checkNames = data.data.checks.map((c: { name: string; }) => c.name);
      expect(checkNames).not.toContain('Unused Binaries');
    });

    test('health check shows warning when unused binaries exist', async () => {
      const binariesDir = services.projectConfig.paths.binariesDir;
      const toolDir = `${binariesDir}/fzf`;
      const currentVersion = `${toolDir}/v0.55.0`;
      const oldVersion = `${toolDir}/v0.54.0`;

      // Create both versions
      await fs.mkdir(currentVersion, { recursive: true });
      await fs.mkdir(oldVersion, { recursive: true });
      await fs.writeFile(`${currentVersion}/fzf`, '#!/bin/sh\necho fzf');
      await fs.writeFile(`${oldVersion}/fzf`, '#!/bin/sh\necho fzf old');
      // Current only points to new version
      await fs.symlink('v0.55.0', `${toolDir}/current`);

      const response = await fetch(`${baseUrl}/api/health`);
      const data = await response.json();

      const unusedCheck = data.data.checks.find((c: { name: string; }) => c.name === 'Unused Binaries');
      expect(unusedCheck.status).toBe('warn');
      expect(unusedCheck.message).toBe('');
      expect(unusedCheck.details).toEqual([oldVersion]);
    });

    test('health check reports multiple unused binaries', async () => {
      const binariesDir = services.projectConfig.paths.binariesDir;
      const toolDir = `${binariesDir}/fzf`;
      const currentVersion = `${toolDir}/v0.55.0`;
      const oldVersion1 = `${toolDir}/v0.54.0`;
      const oldVersion2 = `${toolDir}/v0.53.0`;

      // Create all versions
      await fs.mkdir(currentVersion, { recursive: true });
      await fs.mkdir(oldVersion1, { recursive: true });
      await fs.mkdir(oldVersion2, { recursive: true });
      // Current only points to new version
      await fs.symlink('v0.55.0', `${toolDir}/current`);

      const response = await fetch(`${baseUrl}/api/health`);
      const data = await response.json();

      const unusedCheck = data.data.checks.find((c: { name: string; }) => c.name === 'Unused Binaries');
      expect(unusedCheck.status).toBe('warn');
      expect(unusedCheck.message).toBe('');
      expect(unusedCheck.details).toHaveLength(2);
      expect(unusedCheck.details).toContain(oldVersion1);
      expect(unusedCheck.details).toContain(oldVersion2);
    });

    test('health check reports unused binaries across multiple tools', async () => {
      const binariesDir = services.projectConfig.paths.binariesDir;

      // Tool 1: fzf with old version
      const fzfDir = `${binariesDir}/fzf`;
      await fs.mkdir(`${fzfDir}/v0.55.0`, { recursive: true });
      await fs.mkdir(`${fzfDir}/v0.54.0`, { recursive: true });
      await fs.symlink('v0.55.0', `${fzfDir}/current`);

      // Tool 2: bat with old version
      const batDir = `${binariesDir}/bat`;
      await fs.mkdir(`${batDir}/v0.25.0`, { recursive: true });
      await fs.mkdir(`${batDir}/v0.24.0`, { recursive: true });
      await fs.symlink('v0.25.0', `${batDir}/current`);

      const response = await fetch(`${baseUrl}/api/health`);
      const data = await response.json();

      const unusedCheck = data.data.checks.find((c: { name: string; }) => c.name === 'Unused Binaries');
      expect(unusedCheck.status).toBe('warn');
      expect(unusedCheck.message).toBe('');
      expect(unusedCheck.details).toHaveLength(2);
    });
  });

  describe('Edge cases', () => {
    test('handles special characters in tool names', async () => {
      toolConfigs['tool-with-dash'] = createMockToolConfig({ name: 'tool-with-dash' });

      await toolInstallationRegistry.recordToolInstallation({
        toolName: 'tool-with-dash',
        version: '1.0.0',
        installPath: '/binaries/tool-with-dash/2025-01-01',
        timestamp: '2025-01-01-00-00-00',
        binaryPaths: ['/binaries/tool-with-dash/tool'],
      });

      const response = await fetch(`${baseUrl}/api/tools`);
      const data = await response.json();
      const tool = data.data.find((t: { config: { name: string; }; }) => t.config.name === 'tool-with-dash');

      expect(response.status).toBe(200);
      expect(tool.config.name).toBe('tool-with-dash');
    });

    test('handles tool with multiple binaries', async () => {
      toolConfigs['multi-binary'] = createMockToolConfig({
        name: 'multi-binary',
        binaries: ['bin1', 'bin2', 'bin3'],
      });

      await toolInstallationRegistry.recordToolInstallation({
        toolName: 'multi-binary',
        version: '1.0.0',
        installPath: '/binaries/multi-binary/2025-01-01',
        timestamp: '2025-01-01-00-00-00',
        binaryPaths: ['/binaries/multi-binary/bin1', '/binaries/multi-binary/bin2', '/binaries/multi-binary/bin3'],
      });

      const response = await fetch(`${baseUrl}/api/tools`);
      const data = await response.json();
      const tool = data.data.find((t: { config: { name: string; }; }) => t.config.name === 'multi-binary');

      expect(tool.runtime.binaryPaths).toHaveLength(3);
    });
  });
});
