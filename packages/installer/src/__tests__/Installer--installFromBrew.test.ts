import { beforeEach, describe, expect, it } from 'bun:test';
import assert from 'node:assert';
import path from 'node:path';
import { createMock$, type MockShell } from '@dotfiles/testing-helpers';
import { installFromBrew } from '../installers/brew';
import {
  createBrewToolConfig,
  createInstallerTestSetup,
  createTestContext,
  type InstallerTestSetup,
  MOCK_TOOL_NAME,
} from './installer-test-helpers';

describe('Installer - installFromBrew', () => {
  let setup: InstallerTestSetup;
  let mock$: MockShell;

  beforeEach(async () => {
    setup = await createInstallerTestSetup();
    mock$ = createMock$();
  });

  it('should execute brew install command for basic formula', async () => {
    const toolConfig = createBrewToolConfig({
      installParams: {
        formula: 'test-formula',
      },
    });

    const context = createTestContext(setup, {
      installDir: path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME),
    });

    const result = await installFromBrew(MOCK_TOOL_NAME, toolConfig, context, undefined, setup.logger, mock$);

    expect(result.success).toBe(true);
    assert(result.success);
    expect(result.metadata).toEqual({
      method: 'brew',
      formula: 'test-formula',
      isCask: false,
      tap: undefined,
    });

    // Verify brew install was called with correct arguments
    expect(mock$.commands).toContain('brew install test-formula');
  });

  it('should execute brew install with cask option', async () => {
    const toolConfig = createBrewToolConfig({
      installParams: {
        formula: 'test-cask',
        cask: true,
      },
    });

    const context = createTestContext(setup, {
      installDir: path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME),
    });

    const result = await installFromBrew(MOCK_TOOL_NAME, toolConfig, context, undefined, setup.logger, mock$);

    expect(result.success).toBe(true);
    assert(result.success);
    expect(result.metadata).toEqual({
      method: 'brew',
      formula: 'test-cask',
      isCask: true,
      tap: undefined,
    });

    // Verify brew install --cask was called
    expect(mock$.commands).toContain('brew install --cask test-cask');
  });

  it('should execute tap command before install when tap is specified', async () => {
    const toolConfig = createBrewToolConfig({
      installParams: {
        formula: 'test-formula',
        tap: 'custom/tap',
      },
    });

    const context = createTestContext(setup, {
      installDir: path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME),
    });

    const result = await installFromBrew(MOCK_TOOL_NAME, toolConfig, context, undefined, setup.logger, mock$);

    expect(result.success).toBe(true);
    assert(result.success);
    expect(result.metadata).toEqual({
      method: 'brew',
      formula: 'test-formula',
      isCask: false,
      tap: 'custom/tap',
    });

    // Verify tap and install commands were called
    expect(mock$.commands).toContain('brew tap custom/tap');
    expect(mock$.commands).toContain('brew install test-formula');
  });

  it('should execute multiple tap commands when array is provided', async () => {
    const toolConfig = createBrewToolConfig({
      installParams: {
        formula: 'test-formula',
        tap: ['tap1/repo', 'tap2/repo'],
      },
    });

    const context = createTestContext(setup, {
      installDir: path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME),
    });

    const result = await installFromBrew(MOCK_TOOL_NAME, toolConfig, context, undefined, setup.logger, mock$);

    expect(result.success).toBe(true);

    // Verify both tap commands and install were called
    expect(mock$.commands).toContain('brew tap tap1/repo');
    expect(mock$.commands).toContain('brew tap tap2/repo');
    expect(mock$.commands).toContain('brew install test-formula');
  });

  it('should include force flag when options.force is true', async () => {
    const toolConfig = createBrewToolConfig({
      installParams: {
        formula: 'test-formula',
      },
    });

    const context = createTestContext(setup, {
      installDir: path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME),
    });

    const result = await installFromBrew(
      MOCK_TOOL_NAME,
      toolConfig,
      context,
      {
        force: true,
      },
      setup.logger,
      mock$
    );

    expect(result.success).toBe(true);

    // Verify force flag was included
    expect(mock$.commands).toContain('brew install --force test-formula');
  });

  it('should return error when install parameters are missing', async () => {
    const toolConfig = createBrewToolConfig({
      installParams: undefined,
    });

    const context = createTestContext(setup, {
      installDir: path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME),
    });

    const result = await installFromBrew(MOCK_TOOL_NAME, toolConfig, context, undefined, setup.logger, mock$);

    expect(result.success).toBe(false);
    assert(!result.success);
    expect(result.error).toBe('Install parameters not specified');
  });

  it('should fetch and include version from brew info', async () => {
    const brewInfoJson = JSON.stringify([
      {
        name: 'ripgrep',
        versions: {
          stable: '14.1.0',
          head: 'HEAD',
          bottle: true,
        },
      },
    ]);

    // Configure mock$ to return version info
    mock$.mockResponse('brew info --json test-formula', {
      stdout: Buffer.from(brewInfoJson),
      stderr: Buffer.from(''),
      exitCode: 0,
    });

    const toolConfig = createBrewToolConfig({
      installParams: {
        formula: 'test-formula',
      },
    });

    const context = createTestContext(setup, {
      installDir: path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME),
    });

    const result = await installFromBrew(MOCK_TOOL_NAME, toolConfig, context, undefined, setup.logger, mock$);

    expect(result.success).toBe(true);
    assert(result.success);
    expect(result.version).toBe('14.1.0');
    expect(mock$.commands).toContain('brew info --json test-formula');
  });

  it('should handle missing version gracefully', async () => {
    // Configure mock$ to return info without stable version
    mock$.mockResponse('brew info --json test-formula', {
      stdout: Buffer.from(JSON.stringify([{ name: 'test-formula', versions: {} }])),
      stderr: Buffer.from(''),
      exitCode: 0,
    });

    const toolConfig = createBrewToolConfig({
      installParams: {
        formula: 'test-formula',
      },
    });

    const context = createTestContext(setup, {
      installDir: path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME),
    });

    const result = await installFromBrew(MOCK_TOOL_NAME, toolConfig, context, undefined, setup.logger, mock$);

    expect(result.success).toBe(true);
    assert(result.success);
    expect(result.version).toBeUndefined();
  });

  it('should handle invalid JSON from brew info gracefully', async () => {
    // Configure mock$ to return empty output (simulating brew info failure)
    mock$.mockResponse('brew info --json test-formula', {
      stdout: Buffer.from(''),
      stderr: Buffer.from('Error: No available formula with the name "test-formula"'),
      exitCode: 1,
    });

    const toolConfig = createBrewToolConfig({
      installParams: {
        formula: 'test-formula',
      },
    });

    const context = createTestContext(setup, {
      installDir: path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME),
    });

    const result = await installFromBrew(MOCK_TOOL_NAME, toolConfig, context, undefined, setup.logger, mock$);

    expect(result.success).toBe(true);
    assert(result.success);
    expect(result.version).toBeUndefined();
  });
});
