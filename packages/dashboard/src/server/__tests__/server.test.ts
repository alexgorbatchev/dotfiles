import { createMemFileSystem, type IFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { RegistryDatabase } from '@dotfiles/registry-database';
import { FileRegistry } from '@dotfiles/registry/file';
import { ToolInstallationRegistry } from '@dotfiles/registry/tool';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { createMockProjectConfig, createMockVersionChecker } from '../../testing-helpers';
import { createDashboardServer } from '../dashboard-server';
import type { IDashboardServices } from '../types';

describe('Dashboard HTTP Server', () => {
  let logger: TestLogger;
  let registryDatabase: RegistryDatabase;
  let fileRegistry: FileRegistry;
  let toolInstallationRegistry: ToolInstallationRegistry;
  let services: IDashboardServices;
  let server: ReturnType<typeof createDashboardServer>;
  let baseUrl: string;
  let fs: IFileSystem;

  beforeEach(async () => {
    logger = new TestLogger();
    registryDatabase = new RegistryDatabase(logger, ':memory:');
    const db = registryDatabase.getConnection();
    fileRegistry = new FileRegistry(logger, db);
    toolInstallationRegistry = new ToolInstallationRegistry(logger, db);

    const memFs = await createMemFileSystem();
    fs = memFs.fs;

    services = {
      projectConfig: createMockProjectConfig(),
      fs,
      fileRegistry,
      toolInstallationRegistry,
      versionChecker: createMockVersionChecker(),
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

  describe('GET /api/tools', () => {
    test('returns empty array when no tools installed', async () => {
      const response = await fetch(`${baseUrl}/api/tools`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual([]);
    });

    test('returns tool summaries for installed tools', async () => {
      await toolInstallationRegistry.recordToolInstallation({
        toolName: 'fzf',
        version: '0.55.0',
        installPath: '/binaries/fzf/2025-01-01',
        timestamp: '2025-01-01-00-00-00',
        binaryPaths: ['/binaries/fzf/fzf'],
        downloadUrl: 'https://github.com/junegunn/fzf/releases/download/v0.55.0/fzf-0.55.0-darwin_arm64.tar.gz',
      });

      const response = await fetch(`${baseUrl}/api/tools`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].name).toBe('fzf');
      expect(data.data[0].version).toBe('0.55.0');
    });

    test('returns multiple tools', async () => {
      await toolInstallationRegistry.recordToolInstallation({
        toolName: 'fzf',
        version: '0.55.0',
        installPath: '/binaries/fzf/2025-01-01',
        timestamp: '2025-01-01-00-00-00',
        binaryPaths: ['/binaries/fzf/fzf'],
      });
      await toolInstallationRegistry.recordToolInstallation({
        toolName: 'bat',
        version: '0.24.0',
        installPath: '/binaries/bat/2025-01-01',
        timestamp: '2025-01-01-00-00-00',
        binaryPaths: ['/binaries/bat/bat'],
      });

      const response = await fetch(`${baseUrl}/api/tools`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toHaveLength(2);
    });
  });

  describe('GET /api/stats', () => {
    test('returns stats for empty registry', async () => {
      const response = await fetch(`${baseUrl}/api/stats`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.toolsInstalled).toBe(0);
      expect(data.data.filesTracked).toBe(0);
      expect(data.data.totalOperations).toBe(0);
    });

    test('returns accurate stats', async () => {
      await toolInstallationRegistry.recordToolInstallation({
        toolName: 'fzf',
        version: '0.55.0',
        installPath: '/binaries/fzf/2025-01-01',
        timestamp: '2025-01-01-00-00-00',
        binaryPaths: ['/binaries/fzf/fzf'],
      });
      await fileRegistry.recordOperation({
        toolName: 'fzf',
        operationType: 'writeFile',
        filePath: '/bin/fzf',
        fileType: 'shim',
        operationId: randomUUID(),
      });

      const response = await fetch(`${baseUrl}/api/stats`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.toolsInstalled).toBe(1);
      expect(data.data.filesTracked).toBe(1);
      expect(data.data.totalOperations).toBe(1);
    });
  });

  describe('GET /api/health', () => {
    test('returns health status', async () => {
      const response = await fetch(`${baseUrl}/api/health`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.overall).toBeDefined();
      expect(data.data.checks).toBeInstanceOf(Array);
      expect(data.data.lastCheck).toBeDefined();
    });

    test('includes registry and tool checks', async () => {
      const response = await fetch(`${baseUrl}/api/health`);
      const data = await response.json();

      const checkNames = data.data.checks.map((c: { name: string; }) => c.name);
      expect(checkNames).toContain('Registry Integrity');
      expect(checkNames).toContain('Tool Installations');
    });
  });

  describe('GET /api/config', () => {
    test('returns configuration summary', async () => {
      const response = await fetch(`${baseUrl}/api/config`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.dotfilesDir).toBe('/home/user/.dotfiles');
      expect(data.data.generatedDir).toBe('/home/user/.dotfiles/.generated');
      expect(data.data.binariesDir).toBe('/home/user/.dotfiles/.generated/binaries');
      expect(data.data.targetDir).toBe('/home/user/.dotfiles/.generated/bin-default');
      expect(data.data.toolConfigsDir).toBe('/home/user/.dotfiles/tools');
    });
  });

  describe('GET /api/shell', () => {
    test('returns empty shell integration when no shell files', async () => {
      const response = await fetch(`${baseUrl}/api/shell`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.completions).toEqual([]);
      expect(data.data.initScripts).toEqual([]);
      expect(data.data.totalFiles).toBe(0);
    });

    test('returns completions and init scripts', async () => {
      await fileRegistry.recordOperation({
        toolName: 'fzf',
        operationType: 'writeFile',
        filePath: '/completions/_fzf',
        fileType: 'completion',
        operationId: randomUUID(),
      });
      await fileRegistry.recordOperation({
        toolName: 'starship',
        operationType: 'writeFile',
        filePath: '/shell-scripts/starship.zsh',
        fileType: 'init',
        operationId: randomUUID(),
      });

      const response = await fetch(`${baseUrl}/api/shell`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.completions).toHaveLength(1);
      expect(data.data.initScripts).toHaveLength(1);
      expect(data.data.totalFiles).toBe(2);
    });
  });

  describe('GET /api/activity', () => {
    test('returns empty activity when no operations', async () => {
      const response = await fetch(`${baseUrl}/api/activity`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.activities).toEqual([]);
      expect(data.data.totalCount).toBe(0);
    });

    test('returns activities with relative time', async () => {
      await fileRegistry.recordOperation({
        toolName: 'fzf',
        operationType: 'writeFile',
        filePath: '/bin/fzf',
        fileType: 'shim',
        operationId: randomUUID(),
      });

      const response = await fetch(`${baseUrl}/api/activity`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.activities).toHaveLength(1);
      expect(data.data.activities[0].relativeTime).toBeDefined();
      expect(data.data.totalCount).toBe(1);
    });

    test('respects limit query param', async () => {
      for (let i = 0; i < 10; i++) {
        await fileRegistry.recordOperation({
          toolName: `tool-${i}`,
          operationType: 'writeFile',
          filePath: `/bin/tool-${i}`,
          fileType: 'shim',
          operationId: randomUUID(),
        });
      }

      const response = await fetch(`${baseUrl}/api/activity?limit=3`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.activities).toHaveLength(3);
      expect(data.data.totalCount).toBe(10);
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

  describe('Data consistency', () => {
    test('files tracked without tool installations shows tools with files', async () => {
      // File operations exist but no tool installations (like in the real test-project)
      await fileRegistry.recordOperation({
        toolName: 'bat',
        operationType: 'writeFile',
        filePath: '/bin/bat',
        fileType: 'shim',
        operationId: randomUUID(),
      });
      await fileRegistry.recordOperation({
        toolName: 'fd',
        operationType: 'writeFile',
        filePath: '/bin/fd',
        fileType: 'shim',
        operationId: randomUUID(),
      });

      const statsResponse = await fetch(`${baseUrl}/api/stats`);
      const stats = await statsResponse.json();

      expect(stats.data.toolsInstalled).toBe(0);
      expect(stats.data.filesTracked).toBe(2);
      expect(stats.data.totalOperations).toBe(2);

      const toolsResponse = await fetch(`${baseUrl}/api/tools`);
      const tools = await toolsResponse.json();

      // Tools with file operations should be returned even without installation records
      expect(tools.data).toHaveLength(2);
      expect(tools.data.map((t: { name: string; }) => t.name).toSorted()).toEqual(['bat', 'fd']);
      expect(tools.data[0].status).toBe('not-installed');
      expect(tools.data[0].files).toHaveLength(1);
    });

    test('tool detail includes associated files', async () => {
      await toolInstallationRegistry.recordToolInstallation({
        toolName: 'fzf',
        version: '0.55.0',
        installPath: '/binaries/fzf/2025-01-01',
        timestamp: '2025-01-01-00-00-00',
        binaryPaths: ['/binaries/fzf/fzf'],
      });
      await fileRegistry.recordOperation({
        toolName: 'fzf',
        operationType: 'writeFile',
        filePath: '/bin/fzf',
        fileType: 'shim',
        operationId: randomUUID(),
      });
      await fileRegistry.recordOperation({
        toolName: 'fzf',
        operationType: 'symlink',
        filePath: '/usr/local/bin/fzf',
        fileType: 'symlink',
        operationId: randomUUID(),
      });

      const response = await fetch(`${baseUrl}/api/tools`);
      const data = await response.json();
      const tool = data.data.find((t: { name: string; }) => t.name === 'fzf');

      expect(data.success).toBe(true);
      expect(tool.name).toBe('fzf');
      expect(tool.files).toHaveLength(2);
    });

    test('multiple tools with different file types', async () => {
      // Install multiple tools
      const tools = [
        { name: 'fzf', version: '0.55.0' },
        { name: 'bat', version: '0.24.0' },
        { name: 'ripgrep', version: '14.1.0' },
      ];

      for (const tool of tools) {
        await toolInstallationRegistry.recordToolInstallation({
          toolName: tool.name,
          version: tool.version,
          installPath: `/binaries/${tool.name}/2025-01-01`,
          timestamp: '2025-01-01-00-00-00',
          binaryPaths: [`/binaries/${tool.name}/${tool.name}`],
        });
        await fileRegistry.recordOperation({
          toolName: tool.name,
          operationType: 'writeFile',
          filePath: `/bin/${tool.name}`,
          fileType: 'shim',
          operationId: randomUUID(),
        });
      }

      const statsResponse = await fetch(`${baseUrl}/api/stats`);
      const stats = await statsResponse.json();

      expect(stats.data.toolsInstalled).toBe(3);
      expect(stats.data.filesTracked).toBe(3);

      const toolsResponse = await fetch(`${baseUrl}/api/tools`);
      const toolsList = await toolsResponse.json();

      expect(toolsList.data).toHaveLength(3);
      expect(toolsList.data.map((t: { name: string; }) => t.name).toSorted()).toEqual(['bat', 'fzf', 'ripgrep']);
    });

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
  });

  describe('Edge cases', () => {
    test('handles special characters in tool names', async () => {
      await toolInstallationRegistry.recordToolInstallation({
        toolName: 'tool-with-dash',
        version: '1.0.0',
        installPath: '/binaries/tool-with-dash/2025-01-01',
        timestamp: '2025-01-01-00-00-00',
        binaryPaths: ['/binaries/tool-with-dash/tool'],
      });

      const response = await fetch(`${baseUrl}/api/tools`);
      const data = await response.json();
      const tool = data.data.find((t: { name: string; }) => t.name === 'tool-with-dash');

      expect(response.status).toBe(200);
      expect(tool.name).toBe('tool-with-dash');
    });

    test('handles tool with multiple binaries', async () => {
      await toolInstallationRegistry.recordToolInstallation({
        toolName: 'multi-binary',
        version: '1.0.0',
        installPath: '/binaries/multi-binary/2025-01-01',
        timestamp: '2025-01-01-00-00-00',
        binaryPaths: ['/binaries/multi-binary/bin1', '/binaries/multi-binary/bin2', '/binaries/multi-binary/bin3'],
      });

      const response = await fetch(`${baseUrl}/api/tools`);
      const data = await response.json();
      const tool = data.data.find((t: { name: string; }) => t.name === 'multi-binary');

      expect(tool.binaryPaths).toHaveLength(3);
    });
  });
});
