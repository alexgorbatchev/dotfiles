import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { TestLogger } from '@dotfiles/logger';
import { RegistryDatabase } from '@dotfiles/registry-database';
import { ToolInstallationRegistry } from '../ToolInstallationRegistry';
import type { ToolInstallationDetails } from '../types';

describe('ToolInstallationRegistry', () => {
  let registry: ToolInstallationRegistry;
  let registryDatabase: RegistryDatabase;
  let logger: TestLogger;
  let dbPath: string;

  beforeEach(() => {
    logger = new TestLogger();
    dbPath = path.join('/tmp', `test-tool-registry-${randomUUID()}.db`);
    registryDatabase = new RegistryDatabase(logger, dbPath);
    registry = new ToolInstallationRegistry(logger, registryDatabase.getConnection());
  });

  afterEach(async () => {
    registryDatabase.close();
    await registry.close();
    try {
      await unlink(dbPath);
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('recordToolInstallation', () => {
    test('should record a new tool installation', async () => {
      const installation: ToolInstallationDetails = {
        toolName: 'fzf',
        version: '0.54.0',
        installPath: 'binaries/fzf/2025-08-13-20-32-49',
        timestamp: '2025-08-13-20-32-49',
        binaryPaths: ['binaries/fzf/fzf'],
        downloadUrl: 'https://github.com/junegunn/fzf/releases/download/v0.54.0/fzf-0.54.0-darwin_arm64.tar.gz',
        assetName: 'fzf-0.54.0-darwin_arm64.tar.gz',
        configuredVersion: 'latest',
      };

      await registry.recordToolInstallation(installation);

      const retrieved = await registry.getToolInstallation('fzf');
      expect(retrieved).toMatchObject({
        toolName: 'fzf',
        version: '0.54.0',
        installPath: 'binaries/fzf/2025-08-13-20-32-49',
        timestamp: '2025-08-13-20-32-49',
        binaryPaths: ['binaries/fzf/fzf'],
        downloadUrl: 'https://github.com/junegunn/fzf/releases/download/v0.54.0/fzf-0.54.0-darwin_arm64.tar.gz',
        assetName: 'fzf-0.54.0-darwin_arm64.tar.gz',
        configuredVersion: 'latest',
      });
      expect(retrieved?.id).toBeNumber();
      expect(retrieved?.installedAt).toBeInstanceOf(Date);
    });

    test('should replace existing tool installation', async () => {
      const installation1: ToolInstallationDetails = {
        toolName: 'fzf',
        version: '0.53.0',
        installPath: 'binaries/fzf/2025-08-13-20-30-00',
        timestamp: '2025-08-13-20-30-00',
        binaryPaths: ['binaries/fzf/fzf'],
      };

      const installation2: ToolInstallationDetails = {
        toolName: 'fzf',
        version: '0.54.0',
        installPath: 'binaries/fzf/2025-08-13-20-32-49',
        timestamp: '2025-08-13-20-32-49',
        binaryPaths: ['binaries/fzf/fzf'],
      };

      await registry.recordToolInstallation(installation1);
      await registry.recordToolInstallation(installation2);

      const retrieved = await registry.getToolInstallation('fzf');
      expect(retrieved?.version).toBe('0.54.0');
      expect(retrieved?.installPath).toBe('binaries/fzf/2025-08-13-20-32-49');
    });

    test('should handle tool installation without metadata', async () => {
      const installation: ToolInstallationDetails = {
        toolName: 'rg',
        version: '14.1.1',
        installPath: 'binaries/rg/2025-08-13-20-35-00',
        timestamp: '2025-08-13-20-35-00',
        binaryPaths: ['binaries/rg/rg'],
      };

      await registry.recordToolInstallation(installation);

      const retrieved = await registry.getToolInstallation('rg');
      expect(retrieved?.downloadUrl).toBeUndefined();
      expect(retrieved?.assetName).toBeUndefined();
      expect(retrieved?.configuredVersion).toBeUndefined();
    });
  });

  describe('getToolInstallation', () => {
    test('should return null for non-existent tool', async () => {
      const result = await registry.getToolInstallation('nonexistent');
      expect(result).toBeNull();
    });

    test('should return tool installation with all fields', async () => {
      const installation: ToolInstallationDetails = {
        toolName: 'bat',
        version: '0.24.0',
        installPath: 'binaries/bat/2025-08-13-20-40-00',
        timestamp: '2025-08-13-20-40-00',
        binaryPaths: ['binaries/bat/bat'],
        downloadUrl: 'https://example.com/bat.tar.gz',
        configuredVersion: '^0.24.0',
      };

      await registry.recordToolInstallation(installation);

      const retrieved = await registry.getToolInstallation('bat');
      expect(retrieved).toMatchObject(installation);
      expect(retrieved?.id).toBeNumber();
      expect(retrieved?.installedAt).toBeInstanceOf(Date);
    });
  });

  describe('getAllToolInstallations', () => {
    test('should return empty array when no tools installed', async () => {
      const result = await registry.getAllToolInstallations();
      expect(result).toEqual([]);
    });

    test('should return all installed tools sorted by name', async () => {
      const installations: ToolInstallationDetails[] = [
        {
          toolName: 'zsh',
          version: '5.9',
          installPath: 'binaries/zsh/2025-08-13-20-50-00',
          timestamp: '2025-08-13-20-50-00',
          binaryPaths: ['binaries/zsh/zsh'],
        },
        {
          toolName: 'bat',
          version: '0.24.0',
          installPath: 'binaries/bat/2025-08-13-20-40-00',
          timestamp: '2025-08-13-20-40-00',
          binaryPaths: ['binaries/bat/bat'],
        },
        {
          toolName: 'fzf',
          version: '0.54.0',
          installPath: 'binaries/fzf/2025-08-13-20-32-49',
          timestamp: '2025-08-13-20-32-49',
          binaryPaths: ['binaries/fzf/fzf'],
        },
      ];

      for (const installation of installations) {
        await registry.recordToolInstallation(installation);
      }

      const result = await registry.getAllToolInstallations();
      expect(result).toHaveLength(3);
      expect(result.map((t) => t.toolName)).toEqual(['bat', 'fzf', 'zsh']);
    });
  });

  describe('updateToolInstallation', () => {
    beforeEach(async () => {
      const installation: ToolInstallationDetails = {
        toolName: 'fzf',
        version: '0.53.0',
        installPath: 'binaries/fzf/2025-08-13-20-30-00',
        timestamp: '2025-08-13-20-30-00',
        binaryPaths: ['binaries/fzf/fzf'],
        configuredVersion: 'latest',
      };
      await registry.recordToolInstallation(installation);
    });

    test('should update version', async () => {
      await registry.updateToolInstallation('fzf', { version: '0.54.0' });

      const retrieved = await registry.getToolInstallation('fzf');
      expect(retrieved?.version).toBe('0.54.0');
      expect(retrieved?.installPath).toBe('binaries/fzf/2025-08-13-20-30-00');
    });

    test('should update install path and timestamp', async () => {
      await registry.updateToolInstallation('fzf', {
        installPath: 'binaries/fzf/2025-08-13-21-00-00',
        timestamp: '2025-08-13-21-00-00',
      });

      const retrieved = await registry.getToolInstallation('fzf');
      expect(retrieved?.installPath).toBe('binaries/fzf/2025-08-13-21-00-00');
      expect(retrieved?.timestamp).toBe('2025-08-13-21-00-00');
    });

    test('should update binary paths', async () => {
      await registry.updateToolInstallation('fzf', {
        binaryPaths: ['binaries/fzf/fzf', 'binaries/fzf/fzf-tmux'],
      });

      const retrieved = await registry.getToolInstallation('fzf');
      expect(retrieved?.binaryPaths).toEqual(['binaries/fzf/fzf', 'binaries/fzf/fzf-tmux']);
    });

    test('should update metadata', async () => {
      await registry.updateToolInstallation('fzf', {
        configuredVersion: '^0.54.0',
        downloadUrl: 'https://example.com/new-url',
      });

      const retrieved = await registry.getToolInstallation('fzf');
      expect(retrieved?.configuredVersion).toBe('^0.54.0');
      expect(retrieved?.downloadUrl).toBe('https://example.com/new-url');
    });

    test('should handle empty updates', async () => {
      const before = await registry.getToolInstallation('fzf');
      await registry.updateToolInstallation('fzf', {});
      const after = await registry.getToolInstallation('fzf');

      expect(after).toEqual(before);
    });
  });

  describe('removeToolInstallation', () => {
    test('should remove existing tool installation', async () => {
      const installation: ToolInstallationDetails = {
        toolName: 'fzf',
        version: '0.54.0',
        installPath: 'binaries/fzf/2025-08-13-20-32-49',
        timestamp: '2025-08-13-20-32-49',
        binaryPaths: ['binaries/fzf/fzf'],
      };

      await registry.recordToolInstallation(installation);
      expect(await registry.getToolInstallation('fzf')).not.toBeNull();

      await registry.removeToolInstallation('fzf');
      expect(await registry.getToolInstallation('fzf')).toBeNull();
    });

    test('should handle removing non-existent tool', async () => {
      await registry.removeToolInstallation('nonexistent');
      expect(await registry.getToolInstallation('nonexistent')).toBeNull();
    });
  });

  describe('isToolInstalled', () => {
    beforeEach(async () => {
      const installation: ToolInstallationDetails = {
        toolName: 'fzf',
        version: '0.54.0',
        installPath: 'binaries/fzf/2025-08-13-20-32-49',
        timestamp: '2025-08-13-20-32-49',
        binaryPaths: ['binaries/fzf/fzf'],
      };
      await registry.recordToolInstallation(installation);
    });

    test('should return true for installed tool without version check', async () => {
      const result = await registry.isToolInstalled('fzf');
      expect(result).toBe(true);
    });

    test('should return true for installed tool with matching version', async () => {
      const result = await registry.isToolInstalled('fzf', '0.54.0');
      expect(result).toBe(true);
    });

    test('should return false for installed tool with non-matching version', async () => {
      const result = await registry.isToolInstalled('fzf', '0.53.0');
      expect(result).toBe(false);
    });

    test('should return false for non-installed tool', async () => {
      const result = await registry.isToolInstalled('nonexistent');
      expect(result).toBe(false);
    });

    test('should return false for non-installed tool with version', async () => {
      const result = await registry.isToolInstalled('nonexistent', '1.0.0');
      expect(result).toBe(false);
    });
  });

  describe('database persistence', () => {
    test('should persist data across registry instances', async () => {
      const installation: ToolInstallationDetails = {
        toolName: 'persistent-tool',
        version: '1.0.0',
        installPath: 'binaries/persistent-tool/2025-08-13-20-32-49',
        timestamp: '2025-08-13-20-32-49',
        binaryPaths: ['binaries/persistent-tool/tool'],
      };

      await registry.recordToolInstallation(installation);
      await registry.close();

      const newRegistryDatabase = new RegistryDatabase(logger, dbPath);
      const newRegistry = new ToolInstallationRegistry(logger, newRegistryDatabase.getConnection());
      const retrieved = await newRegistry.getToolInstallation('persistent-tool');

      expect(retrieved).toMatchObject(installation);
      await newRegistry.close();
    });
  });
});
