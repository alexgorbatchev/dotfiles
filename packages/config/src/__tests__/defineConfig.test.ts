import { describe, expect, it } from 'bun:test';
import { defineConfig } from '../defineConfig';

describe('defineConfig', () => {
  it('should execute function and return config', async () => {
    const config = await defineConfig(() => ({
      paths: {
        dotfilesDir: '~/.dotfiles',
      },
    }));

    expect(config.paths?.dotfilesDir).toBe('~/.dotfiles');
  });

  it('should support full configuration', async () => {
    const config = await defineConfig(() => ({
      paths: {
        targetDir: '/usr/local/bin',
      },
      github: {
        token: 'test-token',
      },
    }));

    expect(config.paths?.targetDir).toBe('/usr/local/bin');
    expect(config.github?.token).toBe('test-token');
  });

  it('should support partial configuration objects', async () => {
    const config = await defineConfig(() => ({
      github: {
        token: 'test-token',
      },
    }));

    expect(config).toBeDefined();
    expect(config.github).toBeDefined();
    expect(config.github?.token).toBe('test-token');
  });

  it('should allow dynamic values', async () => {
    const testToken = 'my-token';

    const config = await defineConfig(() => ({
      github: {
        token: testToken || 'fallback',
      },
    }));

    expect(config.github?.token).toBe('my-token');
  });
});
