import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig, Config } from '../config'; // Assuming Config type is exported

const dotfilesDir = process.cwd(); // Assuming tests run from .dotfiles root
const envFilePath = path.join(dotfilesDir, '.env');
const tempEnvFilePath = path.join(dotfilesDir, '.env.test_temp');

describe('Configuration Module', () => {
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    // Clear relevant process.env variables that might interfere
    delete process.env.TARGET_DIR;
    delete process.env.DOTFILES_DIR;
    delete process.env.GENERATED_DIR;
    delete process.env.DEBUG;
    delete process.env.CACHE_ENABLED;
    delete process.env.SUDO_PROMPT;
    // Back up original .env if it exists, then remove it
    try {
      await fs.rename(envFilePath, tempEnvFilePath);
    } catch (e: any) {
      if (e.code !== 'ENOENT') throw e; // Ignore if .env doesn't exist
    }
  });

  afterEach(async () => {
    // Restore original .env if it was backed up
    try {
      await fs.rename(tempEnvFilePath, envFilePath);
    } catch (e: any) {
      if (e.code !== 'ENOENT') throw e; // Ignore if .env.test_temp doesn't exist
    }
    // Restore original process.env
    process.env = originalEnv;
  });

  it('should load default configuration if .env is missing and no env vars are set', async () => {
    const config = await loadConfig(dotfilesDir); // Pass dotfilesDir explicitly for testing
    expect(config.TARGET_DIR).toBe('/usr/bin'); // Default from techContext.md
    expect(config.DOTFILES_DIR).toBe(dotfilesDir); // Auto-detected
    expect(config.GENERATED_DIR).toBe(path.join(dotfilesDir, '.generated'));
    expect(config.DEBUG).toBe('');
    expect(config.CACHE_ENABLED).toBe(true);
    expect(config.SUDO_PROMPT).toBe(''); // Default for optional SUDO_PROMPT
  });

  it('should load configuration from .env file', async () => {
    const envContent = [
      'TARGET_DIR=/test/target',
      'DOTFILES_DIR=/test/dotfiles', // This should be overridden by auto-detection if logic prefers
      'GENERATED_DIR=/test/generated',
      'DEBUG=dot:test',
      'CACHE_ENABLED=false',
      'SUDO_PROMPT=TestPrompt:',
    ].join('\n');
    await fs.writeFile(envFilePath, envContent);

    const config = await loadConfig(dotfilesDir);
    expect(config.TARGET_DIR).toBe('/test/target');
    expect(config.DOTFILES_DIR).toBe(dotfilesDir); // Auto-detected path should take precedence
    expect(config.GENERATED_DIR).toBe('/test/generated');
    expect(config.DEBUG).toBe('dot:test');
    expect(config.CACHE_ENABLED).toBe(false);
    expect(config.SUDO_PROMPT).toBe('TestPrompt:');
  });

  it('should prioritize environment variables over .env file and defaults', async () => {
    const envContent = 'TARGET_DIR=/env/file/target\nDEBUG=dot:file';
    await fs.writeFile(envFilePath, envContent);

    process.env.TARGET_DIR = '/proc/env/target';
    process.env.DEBUG = 'dot:proc';
    process.env.CACHE_ENABLED = 'true'; // Test string boolean from env var

    const config = await loadConfig(dotfilesDir);
    expect(config.TARGET_DIR).toBe('/proc/env/target');
    expect(config.DEBUG).toBe('dot:proc');
    expect(config.CACHE_ENABLED).toBe(true); // Should be parsed to boolean
  });

  it('should correctly parse boolean for CACHE_ENABLED from string values', async () => {
    process.env.CACHE_ENABLED = 'false';
    let config = await loadConfig(dotfilesDir);
    expect(config.CACHE_ENABLED).toBe(false);

    process.env.CACHE_ENABLED = 'true';
    config = await loadConfig(dotfilesDir);
    expect(config.CACHE_ENABLED).toBe(true);

    process.env.CACHE_ENABLED = '0'; // Example of other truthy/falsy if supported, but dotenv usually handles 'true'/'false'
    config = await loadConfig(dotfilesDir);
    expect(config.CACHE_ENABLED).toBe(false); // Assuming '0' is falsy for this

    process.env.CACHE_ENABLED = '1';
    config = await loadConfig(dotfilesDir);
    expect(config.CACHE_ENABLED).toBe(true); // Assuming '1' is truthy
  });

  it('should auto-detect DOTFILES_DIR if not set', async () => {
    // DOTFILES_DIR is not set in .env or process.env for this test
    const config = await loadConfig(dotfilesDir);
    expect(config.DOTFILES_DIR).toBe(dotfilesDir);
  });

  it('should use provided DOTFILES_DIR from env var if set', async () => {
    process.env.DOTFILES_DIR = '/custom/dotfiles/path';
    const config = await loadConfig(dotfilesDir); // dotfilesDir param to loadConfig is for finding .env
    expect(config.DOTFILES_DIR).toBe('/custom/dotfiles/path');
    // GENERATED_DIR should be relative to this custom DOTFILES_DIR if not explicitly set
    expect(config.GENERATED_DIR).toBe(path.join('/custom/dotfiles/path', '.generated'));
  });

  it('should use GENERATED_DIR from .env or env var if set, otherwise derive from DOTFILES_DIR', async () => {
    // Case 1: GENERATED_DIR is explicitly set
    process.env.GENERATED_DIR = '/explicit/generated/path';
    let config = await loadConfig(dotfilesDir);
    expect(config.GENERATED_DIR).toBe('/explicit/generated/path');
    delete process.env.GENERATED_DIR;

    // Case 2: GENERATED_DIR is not set, derived from default DOTFILES_DIR
    config = await loadConfig(dotfilesDir);
    expect(config.GENERATED_DIR).toBe(path.join(dotfilesDir, '.generated'));

    // Case 3: GENERATED_DIR is not set, derived from custom DOTFILES_DIR
    process.env.DOTFILES_DIR = '/custom/dotfiles';
    config = await loadConfig(dotfilesDir);
    expect(config.GENERATED_DIR).toBe(path.join('/custom/dotfiles', '.generated'));
    delete process.env.DOTFILES_DIR;
  });
});
