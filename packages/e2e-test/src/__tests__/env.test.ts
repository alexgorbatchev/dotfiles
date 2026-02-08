/**
 * End-to-End Tests for the env command.
 *
 * These tests verify that the env command correctly:
 * - Creates virtual environment directory with config.ts, source, source.ps1, tools/
 * - Deletes virtual environment with --force flag
 * - Produces correct activation scripts
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
// oxlint-disable-next-line import/no-unassigned-import
import '@dotfiles/testing-helpers';
import { dedentString } from '@dotfiles/cli';
import { Architecture, Platform } from '@dotfiles/core';
import fs from 'node:fs';
import path from 'node:path';
import { TestHarness } from './helpers/TestHarness';

describe('E2E: env command', () => {
  const platformConfigs: ReadonlyArray<{
    platform: Platform;
    architecture: Architecture;
    name: string;
  }> = [
    { platform: Platform.MacOS, architecture: Architecture.Arm64, name: 'macOS ARM64' },
    { platform: Platform.Linux, architecture: Architecture.X86_64, name: 'Linux x86_64' },
  ];

  for (const config of platformConfigs) {
    describe(`${config.name}`, () => {
      const harness: TestHarness = new TestHarness({
        testDir: import.meta.dir,
        configPath: 'fixtures/main/config.ts',
        platform: config.platform,
        architecture: config.architecture,
      });

      const testEnvName = 'test-env';
      const testEnvDir = path.join(import.meta.dir, testEnvName);
      const defaultEnvDir = path.join(import.meta.dir, 'env');
      // Use a temp directory for dynamically created envs, separate from static fixtures
      const activatedEnvTempDir = path.join(import.meta.dir, 'activated-env-temp');

      afterAll(async () => {
        await Promise.all([
          fs.promises.rm(testEnvDir, { recursive: true, force: true }),
          fs.promises.rm(defaultEnvDir, { recursive: true, force: true }),
          fs.promises.rm(activatedEnvTempDir, { recursive: true, force: true }),
        ]);
      });

      describe('env create', () => {
        beforeAll(async () => {
          await fs.promises.rm(testEnvDir, { recursive: true, force: true });
          await harness.runCommand(['env', 'create', testEnvName], {
            env: { DOTFILES_BUILT_PACKAGE_NAME: '@dotfiles/cli' },
          });
        });

        it('should create config.ts file with defineConfig import', async () => {
          const configPath = path.join(testEnvDir, 'config.ts');
          const exists = await fs.promises.access(configPath).then(() => true).catch(() => false);
          expect(exists).toBe(true);

          const content = await fs.promises.readFile(configPath, 'utf8');
          expect(content).toMatchLooseInlineSnapshot`
            import { defineConfig } from ${expect.anything};
          `;
        });

        it('should create POSIX source script with shebang', async () => {
          const sourcePath = path.join(testEnvDir, 'source');
          const exists = await fs.promises.access(sourcePath).then(() => true).catch(() => false);
          expect(exists).toBe(true);

          const content = await fs.promises.readFile(sourcePath, 'utf8');
          expect(content).toMatchLooseInlineSnapshot`
            #!/bin/sh
            # ====${expect.anything}
          `;
        });

        it('should create PowerShell source script with header', async () => {
          const sourcePath = path.join(testEnvDir, 'source.ps1');
          const exists = await fs.promises.access(sourcePath).then(() => true).catch(() => false);
          expect(exists).toBe(true);

          const content = await fs.promises.readFile(sourcePath, 'utf8');
          expect(content).toMatchLooseInlineSnapshot`
            # ====${expect.anything}
            # Dotfiles Virtual Environment Activation Script (PowerShell)
          `;
        });

        it('should create tools directory', async () => {
          const toolsDir = path.join(testEnvDir, 'tools');
          const stat = await fs.promises.stat(toolsDir);
          expect(stat.isDirectory()).toBe(true);
        });

        it('should make POSIX source script executable', async () => {
          const sourcePath = path.join(testEnvDir, 'source');
          const stat = await fs.promises.stat(sourcePath);
          const isExecutable = (stat.mode & 0o111) !== 0;
          expect(isExecutable).toBe(true);
        });

        it('should export XDG_CONFIG_HOME in source script', async () => {
          const sourcePath = path.join(testEnvDir, 'source');
          const content = await fs.promises.readFile(sourcePath, 'utf8');
          expect(content).toMatchLooseInlineSnapshot`
            export XDG_CONFIG_HOME="\${_dotfiles_script_dir}/.config"
          `;
        });

        it('should export XDG_CONFIG_HOME in PowerShell script', async () => {
          const sourcePath = path.join(testEnvDir, 'source.ps1');
          const content = await fs.promises.readFile(sourcePath, 'utf8');
          expect(content).toMatchLooseInlineSnapshot`
            $env:XDG_CONFIG_HOME = "$scriptDir\\.config"
          `;
        });
      });

      describe('env create when already exists', () => {
        beforeAll(async () => {
          await fs.promises.rm(testEnvDir, { recursive: true, force: true });
          await harness.runCommand(['env', 'create', testEnvName], {
            env: { DOTFILES_BUILT_PACKAGE_NAME: '@dotfiles/cli' },
          });
        });

        it('should fail when environment already exists', async () => {
          const result = await harness.runCommand(['env', 'create', testEnvName]);

          expect(result.code).not.toBe(0);
          expect(result.stdout).toMatchLooseInlineSnapshot`
            WARN	Environment already exists at ${expect.anything}
            ERROR	Environment create failed: Environment already exists at ${expect.anything}
          `;
        });
      });

      describe('env delete', () => {
        beforeAll(async () => {
          await fs.promises.rm(testEnvDir, { recursive: true, force: true });
          await harness.runCommand(['env', 'create', testEnvName], {
            env: { DOTFILES_BUILT_PACKAGE_NAME: '@dotfiles/cli' },
          });
          await harness.runCommand(['env', 'delete', testEnvName, '--force']);
        });

        it('should have removed the environment directory', async () => {
          const exists = await fs.promises.access(testEnvDir).then(() => true).catch(() => false);
          expect(exists).toBe(false);
        });
      });

      describe('env delete non-existent', () => {
        it('should fail when environment does not exist', async () => {
          const result = await harness.runCommand(['env', 'delete', 'non-existent-env', '--force']);

          expect(result.code).not.toBe(0);
          expect(result.stdout).toMatchLooseInlineSnapshot`
            ERROR	Environment not found at ${expect.anything}
          `;
        });
      });

      describe('env create with default name', () => {
        beforeAll(async () => {
          await fs.promises.rm(defaultEnvDir, { recursive: true, force: true });
          await harness.runCommand(['env', 'create'], {
            env: { DOTFILES_BUILT_PACKAGE_NAME: '@dotfiles/cli' },
          });
        });

        it('should have created the default env directory', async () => {
          const exists = await fs.promises.access(defaultEnvDir).then(() => true).catch(() => false);
          expect(exists).toBe(true);
        });
      });

      describe('env delete with default name', () => {
        beforeAll(async () => {
          await fs.promises.rm(defaultEnvDir, { recursive: true, force: true });
          await harness.runCommand(['env', 'create'], {
            env: { DOTFILES_BUILT_PACKAGE_NAME: '@dotfiles/cli' },
          });
          await harness.runCommand(['env', 'delete', '--force']);
        });

        it('should have removed the default env directory', async () => {
          const exists = await fs.promises.access(defaultEnvDir).then(() => true).catch(() => false);
          expect(exists).toBe(false);
        });
      });

      describe('activated environment with tool', () => {
        const shellOnlyToolContent = dedentString(`
          import { defineTool } from '@dotfiles/cli';

          export default defineTool((install) =>
            install()
              .zsh((shell) =>
                shell.aliases({ 'env-test-alias': 'echo "env tool works"' })
              )
              .bash((shell) =>
                shell.aliases({ 'env-test-alias': 'echo "env tool works"' })
              )
          );
        `);

        beforeAll(async () => {
          await fs.promises.rm(activatedEnvTempDir, { recursive: true, force: true });
          await harness.runCommand(['env', 'create', 'activated-env-temp'], {
            env: { DOTFILES_BUILT_PACKAGE_NAME: '@dotfiles/cli' },
          });
          // Add a shell-only tool that doesn't require network
          const toolPath = path.join(activatedEnvTempDir, 'tools', 'test-tool.tool.ts');
          await fs.promises.writeFile(toolPath, shellOnlyToolContent);
        });

        it('should use env config when env is activated', async () => {
          const result = await harness.runCommandWithActivatedEnv(activatedEnvTempDir, ['generate']);

          expect(result.code).toBe(0);
        });

        it('should create .generated directory in env when activated', async () => {
          const generatedDir = path.join(activatedEnvTempDir, '.generated');
          const exists = await fs.promises.access(generatedDir).then(() => true).catch(() => false);
          expect(exists).toBe(true);
        });

        it('should create shell-scripts in env .generated directory', async () => {
          const shellScriptsDir = path.join(activatedEnvTempDir, '.generated', 'shell-scripts');
          const exists = await fs.promises.access(shellScriptsDir).then(() => true).catch(() => false);
          expect(exists).toBe(true);
        });

        it('should include tool alias in generated zsh script', async () => {
          const zshScript = path.join(activatedEnvTempDir, '.generated', 'shell-scripts', 'main.zsh');
          const content = await fs.promises.readFile(zshScript, 'utf8');
          expect(content).toMatchLooseInlineSnapshot`
            alias env-test-alias="echo \\"env tool works\\""
          `;
        });

        it('should include tool alias in generated bash script', async () => {
          const bashScript = path.join(activatedEnvTempDir, '.generated', 'shell-scripts', 'main.bash');
          const content = await fs.promises.readFile(bashScript, 'utf8');
          expect(content).toMatchLooseInlineSnapshot`
            alias env-test-alias="echo \\"env tool works\\""
          `;
        });
      });
    });
  }
});
