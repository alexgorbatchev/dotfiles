/**
 * E2E test for stale symlink detection.
 *
 * Verifies that:
 * - Running generate repeatedly does not produce false "stale symlink" warnings
 * - Adding a new symlink mid-run works without stale warnings
 * - Removing a symlink from config correctly cleans it up as stale
 * - The remaining symlink is not affected by the cleanup
 */
import { Architecture, Platform } from '@dotfiles/core';
import '@dotfiles/testing-helpers';
import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { TestHarness } from './helpers/TestHarness';

const TOOL_CONFIG_ONE_SYMLINK = `import { defineTool } from '@dotfiles/cli';

export default defineTool((install) =>
  install()
    .symlink('./my-config.yml', '~/.config/symlink-tool/config.yml')
);
`;

const TOOL_CONFIG_TWO_SYMLINKS = `import { defineTool } from '@dotfiles/cli';

export default defineTool((install) =>
  install()
    .symlink('./my-config.yml', '~/.config/symlink-tool/config.yml')
    .symlink('./extra-config.yml', '~/.config/symlink-tool/extra.yml')
);
`;

describe('E2E: stale symlink detection', () => {
  const harness = new TestHarness({
    testDir: import.meta.dir,
    configPath: 'fixtures/symlink-stale/config.ts',
    platform: Platform.MacOS,
    architecture: Architecture.Arm64,
  });

  const toolConfigPath = path.join(
    import.meta.dir,
    'fixtures/symlink-stale/tools/symlink-tool/symlink-tool.tool.ts',
  );

  it('should handle symlink lifecycle: add, stabilize, remove, stabilize', async () => {
    await harness.clean();
    await fs.promises.writeFile(toolConfigPath, TOOL_CONFIG_ONE_SYMLINK);

    const symlinkDir = path.join(harness.generatedDir, 'user-home', '.config', 'symlink-tool');
    const configPath = path.join(symlinkDir, 'config.yml');
    const extraPath = path.join(symlinkDir, 'extra.yml');

    // Phase 1: single symlink, generate twice — no stale warnings
    const run1 = await harness.generate();
    expect(run1.code).toBe(0);
    expect((await fs.promises.lstat(configPath)).isSymbolicLink()).toBe(true);

    const run2 = await harness.generate();
    expect(run2.code).toBe(0);
    expect(run2.stdout).not.toMatch(/stale symlink/i);

    // Phase 2: add second symlink, generate twice — no stale warnings
    await fs.promises.writeFile(toolConfigPath, TOOL_CONFIG_TWO_SYMLINKS);

    const run3 = await harness.generate();
    expect(run3.code).toBe(0);
    expect(run3.stdout).not.toMatch(/stale symlink/i);
    expect((await fs.promises.lstat(configPath)).isSymbolicLink()).toBe(true);
    expect((await fs.promises.lstat(extraPath)).isSymbolicLink()).toBe(true);

    const run4 = await harness.generate();
    expect(run4.code).toBe(0);
    expect(run4.stdout).not.toMatch(/stale symlink/i);

    // Phase 3: remove second symlink — extra.yml should be cleaned up as stale
    await fs.promises.writeFile(toolConfigPath, TOOL_CONFIG_ONE_SYMLINK);

    const run5 = await harness.generate();
    expect(run5.code).toBe(0);
    expect(run5.stdout).toMatch(/Removing stale symlink.*extra\.yml/);
    expect((await fs.promises.lstat(configPath)).isSymbolicLink()).toBe(true);
    const extraExists = await fs.promises.access(extraPath).then(() => true, () => false);
    expect(extraExists).toBe(false);

    // Phase 4: generate again — no stale warnings (cleanup was recorded)
    const run6 = await harness.generate();
    expect(run6.code).toBe(0);
    expect(run6.stdout).not.toMatch(/stale symlink/i);
    expect((await fs.promises.lstat(configPath)).isSymbolicLink()).toBe(true);

    // Restore original config
    await fs.promises.writeFile(toolConfigPath, TOOL_CONFIG_ONE_SYMLINK);
  });
});
