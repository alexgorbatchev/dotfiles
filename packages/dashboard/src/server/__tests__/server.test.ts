/**
 * Server-level integration tests for HTTP routing, SPA serving, and server lifecycle.
 * Individual route tests (e.g., /api/tools, /api/health) should be placed in
 * routes/__tests__/*.test.ts, not here.
 */
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
    const configService = createMockConfigService(toolConfigs);

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

    const port = 10000 + Math.floor(Math.random() * 50000);
    server = createDashboardServer(logger, services, { port, host: 'localhost' });
    await server.start();
    baseUrl = server.getUrl();
  });

  afterEach(async () => {
    await server.stop();
    registryDatabase.close();
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
});
