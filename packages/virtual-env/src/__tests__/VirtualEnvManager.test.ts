import { createMemFileSystem, type MockedFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { beforeEach, describe, expect, it } from 'bun:test';
import assert from 'node:assert';
import path from 'node:path';
import { CONFIG_FILE_NAME, SOURCE_FILE_NAME, TOOLS_DIR_NAME } from '../constants';
import { type IVirtualEnvManager, VirtualEnvManager } from '../VirtualEnvManager';

describe('VirtualEnvManager', () => {
  let logger: TestLogger;
  let fs: MockedFileSystem;
  let manager: IVirtualEnvManager;

  const TEST_PARENT_DIR = '/test/project';

  beforeEach(async () => {
    logger = new TestLogger({ name: 'test' });
    const memFs = await createMemFileSystem();
    fs = memFs.fs;
    await fs.ensureDir(TEST_PARENT_DIR);
    manager = new VirtualEnvManager(logger, fs);
  });

  describe('create', () => {
    it('should create environment with default name', async () => {
      const result = await manager.create({
        name: 'env',
        parentDir: TEST_PARENT_DIR,
        force: false,
      });

      expect(result.success).toBe(true);
      assert(result.success);
      expect(result.envDir).toBe(path.join(TEST_PARENT_DIR, 'env'));
      expect(result.envName).toBe('env');
    });

    it('should create environment with custom name', async () => {
      const result = await manager.create({
        name: 'my-env',
        parentDir: TEST_PARENT_DIR,
        force: false,
      });

      expect(result.success).toBe(true);
      assert(result.success);
      expect(result.envDir).toBe(path.join(TEST_PARENT_DIR, 'my-env'));
      expect(result.envName).toBe('my-env');
    });

    it('should create source file', async () => {
      await manager.create({
        name: 'env',
        parentDir: TEST_PARENT_DIR,
        force: false,
      });

      const sourcePath = path.join(TEST_PARENT_DIR, 'env', SOURCE_FILE_NAME);
      const exists = await fs.exists(sourcePath);
      expect(exists).toBe(true);
    });

    it('should create config file', async () => {
      await manager.create({
        name: 'env',
        parentDir: TEST_PARENT_DIR,
        force: false,
      });

      const configPath = path.join(TEST_PARENT_DIR, 'env', CONFIG_FILE_NAME);
      const exists = await fs.exists(configPath);
      expect(exists).toBe(true);
    });

    it('should create tools directory', async () => {
      await manager.create({
        name: 'env',
        parentDir: TEST_PARENT_DIR,
        force: false,
      });

      const toolsDir = path.join(TEST_PARENT_DIR, 'env', TOOLS_DIR_NAME);
      const exists = await fs.exists(toolsDir);
      expect(exists).toBe(true);
    });

    it('should fail if environment already exists without force', async () => {
      // Create environment first
      await manager.create({
        name: 'env',
        parentDir: TEST_PARENT_DIR,
        force: false,
      });

      // Try to create again
      const result = await manager.create({
        name: 'env',
        parentDir: TEST_PARENT_DIR,
        force: false,
      });

      expect(result.success).toBe(false);
      assert(!result.success);
      expect(result.error).toBe(`Environment already exists at ${path.join(TEST_PARENT_DIR, 'env')}`);
    });

    it('should overwrite environment with force option', async () => {
      // Create environment first
      await manager.create({
        name: 'env',
        parentDir: TEST_PARENT_DIR,
        force: false,
      });

      // Write a custom file
      const customFile = path.join(TEST_PARENT_DIR, 'env', 'custom.txt');
      await fs.writeFile(customFile, 'custom content');

      // Create again with force
      const result = await manager.create({
        name: 'env',
        parentDir: TEST_PARENT_DIR,
        force: true,
      });

      expect(result.success).toBe(true);

      // Custom file should be gone
      const exists = await fs.exists(customFile);
      expect(exists).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete an existing environment', async () => {
      // Create environment first
      await manager.create({
        name: 'env',
        parentDir: TEST_PARENT_DIR,
        force: false,
      });

      const envDir = path.join(TEST_PARENT_DIR, 'env');
      const result = await manager.delete(envDir);

      expect(result.success).toBe(true);
      assert(result.success);
      expect(result.envDir).toBe(envDir);

      // Directory should be gone
      const exists = await fs.exists(envDir);
      expect(exists).toBe(false);
    });

    it('should fail if environment does not exist', async () => {
      const envDir = path.join(TEST_PARENT_DIR, 'nonexistent');
      const result = await manager.delete(envDir);

      expect(result.success).toBe(false);
      assert(!result.success);
      expect(result.error).toBe(`Environment not found at ${envDir}`);
    });
  });

  describe('getEnvInfo', () => {
    it('should return info for a valid environment', async () => {
      await manager.create({
        name: 'env',
        parentDir: TEST_PARENT_DIR,
        force: false,
      });

      const envDir = path.join(TEST_PARENT_DIR, 'env');
      const info = await manager.getEnvInfo(envDir);

      expect(info).not.toBeNull();
      expect(info?.name).toBe('env');
      expect(info?.configPath).toBe(path.join(envDir, CONFIG_FILE_NAME));
      expect(info?.sourcePath).toBe(path.join(envDir, SOURCE_FILE_NAME));
      expect(info?.toolsDir).toBe(path.join(envDir, TOOLS_DIR_NAME));
    });

    it('should return null for invalid environment', async () => {
      const envDir = path.join(TEST_PARENT_DIR, 'invalid');
      await fs.ensureDir(envDir);

      const info = await manager.getEnvInfo(envDir);
      expect(info).toBeNull();
    });
  });

  describe('isValidEnv', () => {
    it('should return true for valid environment', async () => {
      await manager.create({
        name: 'env',
        parentDir: TEST_PARENT_DIR,
        force: false,
      });

      const envDir = path.join(TEST_PARENT_DIR, 'env');
      const isValid = await manager.isValidEnv(envDir);
      expect(isValid).toBe(true);
    });

    it('should return false for directory without source file', async () => {
      const envDir = path.join(TEST_PARENT_DIR, 'invalid');
      await fs.ensureDir(envDir);
      await fs.writeFile(path.join(envDir, CONFIG_FILE_NAME), 'export default {}');

      const isValid = await manager.isValidEnv(envDir);
      expect(isValid).toBe(false);
    });

    it('should return false for directory without config file', async () => {
      const envDir = path.join(TEST_PARENT_DIR, 'invalid');
      await fs.ensureDir(envDir);
      await fs.writeFile(path.join(envDir, SOURCE_FILE_NAME), '# source');

      const isValid = await manager.isValidEnv(envDir);
      expect(isValid).toBe(false);
    });

    it('should return false for nonexistent directory', async () => {
      const envDir = path.join(TEST_PARENT_DIR, 'nonexistent');
      const isValid = await manager.isValidEnv(envDir);
      expect(isValid).toBe(false);
    });
  });

  describe('detectEnv', () => {
    it('should detect environment with default name', async () => {
      await manager.create({
        name: 'env',
        parentDir: TEST_PARENT_DIR,
        force: false,
      });

      const result = await manager.detectEnv(TEST_PARENT_DIR);

      expect(result.found).toBe(true);
      assert(result.found);
      expect(result.envName).toBe('env');
      expect(result.envDir).toBe(path.join(TEST_PARENT_DIR, 'env'));
    });

    it('should detect environment with custom name', async () => {
      await manager.create({
        name: 'my-env',
        parentDir: TEST_PARENT_DIR,
        force: false,
      });

      const result = await manager.detectEnv(TEST_PARENT_DIR, 'my-env');

      expect(result.found).toBe(true);
      assert(result.found);
      expect(result.envName).toBe('my-env');
    });

    it('should return not found for missing environment', async () => {
      const result = await manager.detectEnv(TEST_PARENT_DIR);
      expect(result.found).toBe(false);
    });
  });

  describe('getActiveEnv', () => {
    it('should return active when environment variables are set', () => {
      const env: NodeJS.ProcessEnv = {
        DOTFILES_ENV_DIR: '/path/to/env',
        DOTFILES_ENV_NAME: 'my-env',
        DOTFILES_VERSION: '1.0.0',
      };
      const managerWithEnv = new VirtualEnvManager(logger, fs, env);

      const result = managerWithEnv.getActiveEnv();

      expect(result.active).toBe(true);
      assert(result.active);
      expect(result.envDir).toBe('/path/to/env');
      expect(result.envName).toBe('my-env');
    });

    it('should return inactive when environment variables are not set', () => {
      const env: NodeJS.ProcessEnv = { DOTFILES_VERSION: '1.0.0' };
      const managerWithEnv = new VirtualEnvManager(logger, fs, env);

      const result = managerWithEnv.getActiveEnv();
      expect(result.active).toBe(false);
    });

    it('should return inactive when only one variable is set', () => {
      const env: NodeJS.ProcessEnv = { DOTFILES_ENV_DIR: '/path/to/env', DOTFILES_VERSION: '1.0.0' };
      const managerWithEnv = new VirtualEnvManager(logger, fs, env);

      const result = managerWithEnv.getActiveEnv();
      expect(result.active).toBe(false);
    });
  });
});
