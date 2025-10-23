import { beforeEach, describe, expect, it } from 'bun:test';
import path from 'node:path';
import type { YamlConfig } from '@dotfiles/config';
import { createMemFileSystem, type IFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import type { ToolConfig } from '@dotfiles/schemas';
import { always } from '@dotfiles/schemas';
import { createMockYamlConfig, createTestDirectories, type TestDirectories } from '@dotfiles/testing-helpers';
import type { GenerateShellInitOptions } from '../IShellInitGenerator';
import { ShellInitGenerator } from '../ShellInitGenerator';

describe('ShellInitGenerator - Profile Updates', () => {
  let mockFileSystem: IFileSystem;
  let mockAppConfig: YamlConfig;
  let generator: ShellInitGenerator;
  let logger: TestLogger;
  let testDirs: TestDirectories;

  beforeEach(async () => {
    const { fs } = await createMemFileSystem({});
    mockFileSystem = fs;
    logger = new TestLogger();

    testDirs = await createTestDirectories(logger, mockFileSystem, { testName: 'shell-init-profile-updates' });

    mockAppConfig = await createMockYamlConfig({
      config: {
        paths: testDirs.paths,
      },
      filePath: path.join(testDirs.paths.dotfilesDir, 'config.yaml'),
      fileSystem: mockFileSystem,
      logger,
      systemInfo: { platform: 'linux', arch: 'x64', homeDir: testDirs.paths.homeDir },
      env: {},
    });

    generator = new ShellInitGenerator(logger, mockFileSystem, mockAppConfig);
  });

  describe('updateProfileFiles option', () => {
    const toolConfigs: Record<string, ToolConfig> = {
      testTool: {
        name: 'testTool',
        binaries: ['tt'],
        version: '1.0.0',
        shellConfigs: { zsh: { scripts: [always`export TEST_VAR="hello"`] } },
        installationMethod: 'none',
        installParams: undefined,
      },
    };

    it('should update profile files by default when updateProfileFiles is not specified', async () => {
      // Create existing zsh profile
      const zshrcPath = path.join(testDirs.paths.homeDir, '.zshrc');
      await mockFileSystem.ensureDir(path.dirname(zshrcPath));
      await mockFileSystem.writeFile(zshrcPath, '# Existing zsh config\n');

      const options: GenerateShellInitOptions = {
        shellTypes: ['zsh'],
      };

      const result = await generator.generate(toolConfigs, options);

      expect(result).not.toBeNull();
      expect(result?.profileUpdates).toBeDefined();
      expect(result?.profileUpdates).toHaveLength(1);

      const profileUpdate = result?.profileUpdates?.[0];
      expect(profileUpdate).toEqual({
        shellType: 'zsh',
        profilePath: zshrcPath,
        fileExists: true,
        wasUpdated: true,
        wasAlreadyPresent: false,
      });

      // Check that the sourcing line was added
      const profileContent = await mockFileSystem.readFile(zshrcPath);
      const generatedScriptPath = path.join(testDirs.paths.shellScriptsDir, 'main.zsh');
      expect(profileContent).toContain(`source "${generatedScriptPath}"`);
    });

    it('should update profile files when updateProfileFiles is explicitly true', async () => {
      // Create existing bash profile
      const bashrcPath = path.join(testDirs.paths.homeDir, '.bashrc');
      await mockFileSystem.ensureDir(path.dirname(bashrcPath));
      await mockFileSystem.writeFile(bashrcPath, '# Existing bash config\n');

      const options: GenerateShellInitOptions = {
        shellTypes: ['bash'],
        updateProfileFiles: true,
      };

      const result = await generator.generate(toolConfigs, options);

      expect(result?.profileUpdates).toBeDefined();
      expect(result?.profileUpdates).toHaveLength(1);

      const profileUpdate = result?.profileUpdates?.[0];
      expect(profileUpdate?.wasUpdated).toBe(true);

      // Check that the sourcing line was added
      const profileContent = await mockFileSystem.readFile(bashrcPath);
      const generatedScriptPath = path.join(testDirs.paths.shellScriptsDir, 'main.bash');
      expect(profileContent).toContain(`source "${generatedScriptPath}"`);
    });

    it('should not update profile files when updateProfileFiles is false', async () => {
      // Create existing zsh profile
      const zshrcPath = path.join(testDirs.paths.homeDir, '.zshrc');
      await mockFileSystem.ensureDir(path.dirname(zshrcPath));
      await mockFileSystem.writeFile(zshrcPath, '# Existing zsh config\n');

      const options: GenerateShellInitOptions = {
        shellTypes: ['zsh'],
        updateProfileFiles: false,
      };

      const result = await generator.generate(toolConfigs, options);

      expect(result).not.toBeNull();
      expect(result?.profileUpdates).toBeUndefined();

      // Check that the sourcing line was NOT added
      const profileContent = await mockFileSystem.readFile(zshrcPath);
      expect(profileContent).toBe('# Existing zsh config\n');
    });

    it('should handle multiple shell types with profile updates', async () => {
      // Create existing profiles
      const zshrcPath = path.join(testDirs.paths.homeDir, '.zshrc');
      const bashrcPath = path.join(testDirs.paths.homeDir, '.bashrc');

      await mockFileSystem.ensureDir(path.dirname(zshrcPath));
      await mockFileSystem.writeFile(zshrcPath, '# Existing zsh config\n');
      await mockFileSystem.ensureDir(path.dirname(bashrcPath));
      await mockFileSystem.writeFile(bashrcPath, '# Existing bash config\n');

      const options: GenerateShellInitOptions = {
        shellTypes: ['zsh', 'bash'],
        updateProfileFiles: true,
      };

      const result = await generator.generate(toolConfigs, options);

      expect(result?.profileUpdates).toBeDefined();
      expect(result?.profileUpdates).toHaveLength(2);

      // Check zsh profile update
      const zshUpdate = result?.profileUpdates?.find((u) => u.shellType === 'zsh');
      expect(zshUpdate?.wasUpdated).toBe(true);

      // Check bash profile update
      const bashUpdate = result?.profileUpdates?.find((u) => u.shellType === 'bash');
      expect(bashUpdate?.wasUpdated).toBe(true);

      // Verify both profiles were updated with correct paths
      const zshContent = await mockFileSystem.readFile(zshrcPath);
      const bashContent = await mockFileSystem.readFile(bashrcPath);

      expect(zshContent).toContain(`source "${path.join(testDirs.paths.shellScriptsDir, 'main.zsh')}"`);
      expect(bashContent).toContain(`source "${path.join(testDirs.paths.shellScriptsDir, 'main.bash')}"`);
    });

    it('should only update existing profile files (onlyIfExists behavior)', async () => {
      // Don't create any existing profiles

      const options: GenerateShellInitOptions = {
        shellTypes: ['zsh', 'bash'],
        updateProfileFiles: true,
      };

      const result = await generator.generate(toolConfigs, options);

      expect(result?.profileUpdates).toBeDefined();
      expect(result?.profileUpdates).toHaveLength(2);

      // Both profiles should exist but not be updated (because they didn't exist initially)
      const zshUpdate = result?.profileUpdates?.find((u) => u.shellType === 'zsh');
      const bashUpdate = result?.profileUpdates?.find((u) => u.shellType === 'bash');

      expect(zshUpdate).toEqual({
        shellType: 'zsh',
        profilePath: path.join(testDirs.paths.homeDir, '.zshrc'),
        fileExists: false,
        wasUpdated: false,
        wasAlreadyPresent: false,
      });

      expect(bashUpdate).toEqual({
        shellType: 'bash',
        profilePath: path.join(testDirs.paths.homeDir, '.bashrc'),
        fileExists: false,
        wasUpdated: false,
        wasAlreadyPresent: false,
      });

      // Verify profile files were not created
      const zshExists = await mockFileSystem.exists(path.join(testDirs.paths.homeDir, '.zshrc'));
      const bashExists = await mockFileSystem.exists(path.join(testDirs.paths.homeDir, '.bashrc'));
      expect(zshExists).toBe(false);
      expect(bashExists).toBe(false);
    });

    it('should detect when source line already exists and not duplicate it', async () => {
      const generatedScriptPath = path.join(testDirs.paths.shellScriptsDir, 'main.zsh');

      // Create existing profile with source line already present
      const zshrcPath = path.join(testDirs.paths.homeDir, '.zshrc');
      await mockFileSystem.ensureDir(path.dirname(zshrcPath));
      await mockFileSystem.writeFile(zshrcPath, `# Existing zsh config\nsource "${generatedScriptPath}"\n`);

      const options: GenerateShellInitOptions = {
        shellTypes: ['zsh'],
        updateProfileFiles: true,
      };

      const result = await generator.generate(toolConfigs, options);

      expect(result?.profileUpdates).toBeDefined();
      expect(result?.profileUpdates).toHaveLength(1);

      const profileUpdate = result?.profileUpdates?.[0];
      expect(profileUpdate).toEqual({
        shellType: 'zsh',
        profilePath: zshrcPath,
        fileExists: true,
        wasUpdated: false,
        wasAlreadyPresent: true,
      });

      // Check that the profile content was not modified
      const profileContent = await mockFileSystem.readFile(zshrcPath);
      expect(profileContent).toBe(`# Existing zsh config\nsource "${generatedScriptPath}"\n`);
    });

    it('should handle PowerShell profile with correct path and syntax', async () => {
      // Create existing PowerShell profile
      const psProfilePath = path.join(testDirs.paths.homeDir, '.config/powershell/profile.ps1');
      await mockFileSystem.ensureDir(path.dirname(psProfilePath));
      await mockFileSystem.writeFile(psProfilePath, '# Existing PowerShell config\n');

      const psToolConfigs: Record<string, ToolConfig> = {
        testTool: {
          name: 'testTool',
          binaries: ['tt'],
          version: '1.0.0',
          shellConfigs: { powershell: { scripts: [always`$env:TEST_VAR = "hello"`] } },
          installationMethod: 'none',
          installParams: undefined,
        },
      };

      const options: GenerateShellInitOptions = {
        shellTypes: ['powershell'],
        updateProfileFiles: true,
      };

      const result = await generator.generate(psToolConfigs, options);

      expect(result?.profileUpdates).toBeDefined();
      expect(result?.profileUpdates).toHaveLength(1);

      const profileUpdate = result?.profileUpdates?.[0];
      expect(profileUpdate?.wasUpdated).toBe(true);

      // Check that PowerShell dot-source syntax is used
      const profileContent = await mockFileSystem.readFile(psProfilePath);
      const generatedScriptPath = path.join(testDirs.paths.shellScriptsDir, 'main.ps1');
      expect(profileContent).toContain(`. "${generatedScriptPath}"`);
      expect(profileContent).toContain('# Generated via dotfiles generator - do not modify');
      expect(profileContent).toContain('# /path/to/config.yaml');
      expect(profileContent).toContain(
        '# ------------------------------------------------------------------------------'
      );
    });
  });

  describe('error handling', () => {
    it('should continue with generation even if profile updates fail', async () => {
      // Create a read-only file system that will fail profile updates
      const { fs: readOnlyFs } = await createMemFileSystem({});
      const readOnlyGenerator = new ShellInitGenerator(logger, readOnlyFs, mockAppConfig);

      const toolConfigs: Record<string, ToolConfig> = {
        testTool: {
          name: 'testTool',
          binaries: ['tt'],
          version: '1.0.0',
          shellConfigs: { zsh: { scripts: [always`export TEST_VAR="hello"`] } },
          installationMethod: 'none',
          installParams: undefined,
        },
      };

      const options: GenerateShellInitOptions = {
        shellTypes: ['zsh'],
        updateProfileFiles: true,
      };

      // Should not throw even if profile update fails
      const result = await readOnlyGenerator.generate(toolConfigs, options);

      expect(result).not.toBeNull();
      expect(result?.files.size).toBe(1);
      expect(result?.primaryPath).toBeTruthy();

      // Profile updates should still be attempted and return results
      expect(result?.profileUpdates).toBeDefined();
    });
  });
});
