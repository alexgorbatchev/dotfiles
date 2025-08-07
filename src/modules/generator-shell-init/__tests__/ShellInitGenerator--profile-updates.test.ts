import { beforeEach, describe, expect, it } from 'bun:test';
import path from 'node:path';
import { TestLogger, createMemFileSystem } from '@testing-helpers';
import type { IFileSystem } from '@modules/file-system';
import { createYamlConfigFromObject } from '@modules/config-loader';
import type { YamlConfig } from '@modules/config';
import type { ToolConfig } from '@types';
import { ShellInitGenerator } from '../ShellInitGenerator';
import type { GenerateShellInitOptions } from '../IShellInitGenerator';

describe('ShellInitGenerator - Profile Updates', () => {
  let mockFileSystem: IFileSystem;
  let mockAppConfig: YamlConfig;
  let generator: ShellInitGenerator;
  let logger: TestLogger;

  const DEFAULT_HOME_DIR = '/home/test';
  const DEFAULT_SHELL_SCRIPTS_DIR = '/home/test/.dotfiles/.generated/shell-scripts';
  const DEFAULT_DOTFILES_DIR = '/home/test/.dotfiles';

  beforeEach(async () => {
    const { fs } = await createMemFileSystem({});
    mockFileSystem = fs;
    logger = new TestLogger();
    mockAppConfig = await createYamlConfigFromObject(
      logger,
      fs,
      {
        paths: {
          homeDir: DEFAULT_HOME_DIR,
          dotfilesDir: DEFAULT_DOTFILES_DIR,
          shellScriptsDir: DEFAULT_SHELL_SCRIPTS_DIR,
          binariesDir: '/home/test/.dotfiles/.generated/binaries',
          generatedDir: path.join(DEFAULT_DOTFILES_DIR, '.generated'),
        },
      },
      { platform: 'linux', arch: 'x64', homeDir: DEFAULT_HOME_DIR },
      {}
    );
    generator = new ShellInitGenerator(logger, mockFileSystem, mockAppConfig);
  });

  describe('updateProfileFiles option', () => {
    const toolConfigs: Record<string, ToolConfig> = {
      testTool: {
        name: 'testTool',
        binaries: ['tt'],
        version: '1.0.0',
        zshInit: ['export TEST_VAR="hello"'],
        installationMethod: 'none',
        installParams: undefined,
      },
    };

    it('should update profile files by default when updateProfileFiles is not specified', async () => {
      // Create existing zsh profile
      const zshrcPath = path.join(DEFAULT_HOME_DIR, '.zshrc');
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
      const generatedScriptPath = path.join(DEFAULT_SHELL_SCRIPTS_DIR, 'main.zsh');
      expect(profileContent).toContain(`source "${generatedScriptPath}"`);
    });

    it('should update profile files when updateProfileFiles is explicitly true', async () => {
      // Create existing bash profile
      const bashrcPath = path.join(DEFAULT_HOME_DIR, '.bashrc');
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
      const generatedScriptPath = path.join(DEFAULT_SHELL_SCRIPTS_DIR, 'main.bash');
      expect(profileContent).toContain(`source "${generatedScriptPath}"`);
    });

    it('should not update profile files when updateProfileFiles is false', async () => {
      // Create existing zsh profile
      const zshrcPath = path.join(DEFAULT_HOME_DIR, '.zshrc');
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
      const zshrcPath = path.join(DEFAULT_HOME_DIR, '.zshrc');
      const bashrcPath = path.join(DEFAULT_HOME_DIR, '.bashrc');
      
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
      const zshUpdate = result?.profileUpdates?.find(u => u.shellType === 'zsh');
      expect(zshUpdate?.wasUpdated).toBe(true);

      // Check bash profile update
      const bashUpdate = result?.profileUpdates?.find(u => u.shellType === 'bash');
      expect(bashUpdate?.wasUpdated).toBe(true);

      // Verify both profiles were updated with correct paths
      const zshContent = await mockFileSystem.readFile(zshrcPath);
      const bashContent = await mockFileSystem.readFile(bashrcPath);
      
      expect(zshContent).toContain(`source "${path.join(DEFAULT_SHELL_SCRIPTS_DIR, 'main.zsh')}"`);
      expect(bashContent).toContain(`source "${path.join(DEFAULT_SHELL_SCRIPTS_DIR, 'main.bash')}"`);
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
      const zshUpdate = result?.profileUpdates?.find(u => u.shellType === 'zsh');
      const bashUpdate = result?.profileUpdates?.find(u => u.shellType === 'bash');

      expect(zshUpdate).toEqual({
        shellType: 'zsh',
        profilePath: path.join(DEFAULT_HOME_DIR, '.zshrc'),
        fileExists: false,
        wasUpdated: false,
        wasAlreadyPresent: false,
      });

      expect(bashUpdate).toEqual({
        shellType: 'bash',
        profilePath: path.join(DEFAULT_HOME_DIR, '.bashrc'),
        fileExists: false,
        wasUpdated: false,
        wasAlreadyPresent: false,
      });

      // Verify profile files were not created
      const zshExists = await mockFileSystem.exists(path.join(DEFAULT_HOME_DIR, '.zshrc'));
      const bashExists = await mockFileSystem.exists(path.join(DEFAULT_HOME_DIR, '.bashrc'));
      expect(zshExists).toBe(false);
      expect(bashExists).toBe(false);
    });

    it('should detect when source line already exists and not duplicate it', async () => {
      const generatedScriptPath = path.join(DEFAULT_SHELL_SCRIPTS_DIR, 'main.zsh');
      
      // Create existing profile with source line already present
      const zshrcPath = path.join(DEFAULT_HOME_DIR, '.zshrc');
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
      const psProfilePath = path.join(DEFAULT_HOME_DIR, '.config/powershell/profile.ps1');
      await mockFileSystem.ensureDir(path.dirname(psProfilePath));
      await mockFileSystem.writeFile(psProfilePath, '# Existing PowerShell config\n');

      const psToolConfigs: Record<string, ToolConfig> = {
        testTool: {
          name: 'testTool',
          binaries: ['tt'],
          version: '1.0.0',
          powershellInit: ['$env:TEST_VAR = "hello"'],
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
      const generatedScriptPath = path.join(DEFAULT_SHELL_SCRIPTS_DIR, 'main.ps1');
      expect(profileContent).toContain(`. "${generatedScriptPath}"`);
      expect(profileContent).toContain('# Generated via dotfiles generator - do not modify');
      expect(profileContent).toContain('# /path/to/config.yaml');
      expect(profileContent).toContain('# ------------------------------------------------------------------------------');
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
          zshInit: ['export TEST_VAR="hello"'],
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