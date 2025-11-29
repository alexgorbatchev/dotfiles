import { describe, expect, it } from 'bun:test';
import type { ISystemInfo } from '@dotfiles/core';
import { defineConfig } from '../defineConfig';

const mockContext = {
  configFileDir: '/tmp',
  systemInfo: {} as ISystemInfo,
};

describe('defineConfig', () => {
  it('should execute function and return config', async () => {
    const factory = defineConfig(() => ({
      paths: {
        dotfilesDir: '~/.dotfiles',
      },
    }));
    const config = await factory(mockContext);

    expect(config.paths?.dotfilesDir).toBe('~/.dotfiles');
  });

  it('should support full configuration', async () => {
    const factory = defineConfig(() => ({
      paths: {
        targetDir: '/usr/local/bin',
      },
      github: {
        token: 'test-token',
      },
    }));
    const config = await factory(mockContext);

    expect(config.paths?.targetDir).toBe('/usr/local/bin');
    expect(config.github?.token).toBe('test-token');
  });

  it('should support partial configuration objects', async () => {
    const factory = defineConfig(() => ({
      github: {
        token: 'test-token',
      },
    }));
    const config = await factory(mockContext);

    expect(config).toBeDefined();
    expect(config.github).toBeDefined();
    expect(config.github?.token).toBe('test-token');
  });

  it('should allow dynamic values', async () => {
    const testToken = 'my-token';

    const factory = defineConfig(() => ({
      github: {
        token: testToken || 'fallback',
      },
    }));
    const config = await factory(mockContext);

    expect(config.github?.token).toBe('my-token');
  });
});
