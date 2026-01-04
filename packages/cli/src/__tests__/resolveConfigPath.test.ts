import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import os from 'node:os';
import { NodeFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { DEFAULT_CONFIG_FILES, resolveConfigPath } from '../resolveConfigPath';

describe('resolveConfigPath', () => {
  let logger: TestLogger;
  let existsSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    logger = new TestLogger({ name: 'test' });
    existsSpy = spyOn(NodeFileSystem.prototype, 'exists');
  });

  afterEach(() => {
    existsSpy.mockRestore();
  });

  describe('with explicit config path', () => {
    it('expands ~/ in explicit config option using bootstrap home', async () => {
      const homedirSpy = spyOn(os, 'homedir').mockReturnValue('/bootstrap-home');

      const result = await resolveConfigPath(logger, '~/config.yaml', '/cwd');

      expect(result).toBe('/bootstrap-home/config.yaml');
      expect(homedirSpy).toHaveBeenCalledTimes(1);

      homedirSpy.mockRestore();
    });

    it('resolves relative path to absolute', async () => {
      const result = await resolveConfigPath(logger, 'my-config.ts', '/home/user/project');

      expect(result).toBe('/home/user/project/my-config.ts');
    });

    it('returns absolute path as-is', async () => {
      const result = await resolveConfigPath(logger, '/absolute/path/config.ts', '/home/user/project');

      expect(result).toBe('/absolute/path/config.ts');
    });

    it('does not check if file exists when explicit path provided', async () => {
      await resolveConfigPath(logger, 'explicit.ts', '/home/user');

      expect(existsSpy).not.toHaveBeenCalled();
    });

    it('logs resolved path', async () => {
      await resolveConfigPath(logger, 'config.ts', '/home/user');

      logger.expect(['DEBUG'], ['test', 'resolveConfigPath'], [], ['Using configuration: /home/user/config.ts']);
    });
  });

  describe('without explicit config path', () => {
    it('returns first existing default config file', async () => {
      existsSpy.mockImplementation(async (filePath: string) => {
        return filePath === '/project/dotfiles.config.ts';
      });

      const result = await resolveConfigPath(logger, '', '/project');

      expect(result).toBe('/project/dotfiles.config.ts');
    });

    it('checks files in priority order', async () => {
      const checkedPaths: string[] = [];
      existsSpy.mockImplementation(async (filePath: string) => {
        checkedPaths.push(filePath);
        return false;
      });

      await resolveConfigPath(logger, '', '/project');

      expect(checkedPaths).toEqual(['/project/dotfiles.config.ts', '/project/dotfiles.config.yaml']);
    });

    it('returns yaml config when ts config does not exist', async () => {
      existsSpy.mockImplementation(async (filePath: string) => {
        return filePath === '/project/dotfiles.config.yaml';
      });

      const result = await resolveConfigPath(logger, '', '/project');

      expect(result).toBe('/project/dotfiles.config.yaml');
    });

    it('returns undefined when no default config files exist', async () => {
      existsSpy.mockResolvedValue(false);

      const result = await resolveConfigPath(logger, '', '/project');

      expect(result).toBeUndefined();
    });

    it('logs resolved path when config found', async () => {
      existsSpy.mockImplementation(async (filePath: string) => {
        return filePath === '/project/dotfiles.config.yaml';
      });

      await resolveConfigPath(logger, '', '/project');

      logger.expect(
        ['DEBUG'],
        ['test', 'resolveConfigPath'],
        [],
        ['Using configuration: /project/dotfiles.config.yaml']
      );
    });
  });

  describe('DEFAULT_CONFIG_FILES', () => {
    it('contains expected default file names', () => {
      expect(DEFAULT_CONFIG_FILES).toEqual(['dotfiles.config.ts', 'dotfiles.config.yaml']);
    });
  });
});
