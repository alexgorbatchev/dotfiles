import { beforeEach, describe, expect, it } from 'bun:test';
import path from 'node:path';
import { createMemFileSystem, type IFileSystem } from '@dotfiles/file-system';
import type { ShellType } from '@dotfiles/schemas';
import { dedentString } from '@dotfiles/utils';
import type { ProfileUpdateConfig } from '../IProfileUpdater';
import { ProfileUpdater } from '../ProfileUpdater';

describe('ProfileUpdater', () => {
  let mockFileSystem: IFileSystem;
  let profileUpdater: ProfileUpdater;
  const homeDir = '/home/test';
  const testYamlConfigPath = '/path/to/config.yaml';

  beforeEach(async () => {
    const { fs } = await createMemFileSystem({});
    mockFileSystem = fs;
    profileUpdater = new ProfileUpdater(mockFileSystem, homeDir);
  });

  describe('getProfilePath', () => {
    it('should return correct zsh profile path', () => {
      const profilePath = profileUpdater.getProfilePath('zsh');
      expect(profilePath).toBe(path.join(homeDir, '.zshrc'));
    });

    it('should return correct bash profile path', () => {
      const profilePath = profileUpdater.getProfilePath('bash');
      expect(profilePath).toBe(path.join(homeDir, '.bashrc'));
    });

    it('should return correct powershell profile path', () => {
      const profilePath = profileUpdater.getProfilePath('powershell');
      expect(profilePath).toBe(path.join(homeDir, '.config/powershell/profile.ps1'));
    });

    it('should throw error for unsupported shell type', () => {
      expect(() => {
        profileUpdater.getProfilePath('fish' as ShellType);
      }).toThrow('Unsupported shell type: fish');
    });
  });

  describe('hasSourceLine', () => {
    const scriptPath = '/path/to/script.zsh';
    const profilePath = '/home/test/.zshrc';

    it('should return true if exact source line exists', async () => {
      const content = dedentString(`
        # Some other content
        source "${scriptPath}"
        # More content
      `);

      await mockFileSystem.ensureDir(path.dirname(profilePath));
      await mockFileSystem.writeFile(profilePath, content);

      const result = await profileUpdater.hasSourceLine(profilePath, scriptPath);
      expect(result).toBe(true);
    });

    it('should return true if source line exists with single quotes', async () => {
      const content = dedentString(`
        # Some other content  
        source '${scriptPath}'
        # More content
      `);

      await mockFileSystem.ensureDir(path.dirname(profilePath));
      await mockFileSystem.writeFile(profilePath, content);

      const result = await profileUpdater.hasSourceLine(profilePath, scriptPath);
      expect(result).toBe(true);
    });

    it('should return true if source line exists with dot syntax', async () => {
      const content = dedentString(`
        # Some other content
        . "${scriptPath}"
        # More content
      `);

      await mockFileSystem.ensureDir(path.dirname(profilePath));
      await mockFileSystem.writeFile(profilePath, content);

      const result = await profileUpdater.hasSourceLine(profilePath, scriptPath);
      expect(result).toBe(true);
    });

    it('should return false if source line does not exist', async () => {
      const content = dedentString(`
        # Some other content
        source "/different/script.zsh"
        # More content
      `);

      await mockFileSystem.ensureDir(path.dirname(profilePath));
      await mockFileSystem.writeFile(profilePath, content);

      const result = await profileUpdater.hasSourceLine(profilePath, scriptPath);
      expect(result).toBe(false);
    });

    it('should return false if profile file does not exist', async () => {
      const result = await profileUpdater.hasSourceLine('/nonexistent/profile', scriptPath);
      expect(result).toBe(false);
    });
  });

  describe('updateProfiles', () => {
    it('should skip updating if profile does not exist and onlyIfExists is true', async () => {
      const configs: ProfileUpdateConfig[] = [
        {
          shellType: 'zsh',
          generatedScriptPath: '/path/to/script.zsh',
          onlyIfExists: true,
          yamlConfigPath: testYamlConfigPath,
        },
      ];

      const results = await profileUpdater.updateProfiles(configs);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        shellType: 'zsh',
        profilePath: path.join(homeDir, '.zshrc'),
        fileExists: false,
        wasUpdated: false,
        wasAlreadyPresent: false,
      });
    });

    it('should create profile file if it does not exist and onlyIfExists is false', async () => {
      const scriptPath = '/path/to/script.zsh';
      const configs: ProfileUpdateConfig[] = [
        {
          shellType: 'zsh',
          generatedScriptPath: scriptPath,
          onlyIfExists: false,
          yamlConfigPath: testYamlConfigPath,
        },
      ];

      const results = await profileUpdater.updateProfiles(configs);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        shellType: 'zsh',
        profilePath: path.join(homeDir, '.zshrc'),
        fileExists: false,
        wasUpdated: true,
        wasAlreadyPresent: false,
      });

      // Check that the file was created with correct content
      const profilePath = path.join(homeDir, '.zshrc');
      const content = await mockFileSystem.readFile(profilePath);

      expect(content).toContain('# Generated via dotfiles generator - do not modify');
      expect(content).toContain('# /path/to/config.yaml');
      expect(content).toContain('# ------------------------------------------------------------------------------');
      expect(content).toContain(`source "${scriptPath}"`);
    });

    it('should add source line to existing profile file', async () => {
      const scriptPath = '/path/to/script.zsh';
      const profilePath = path.join(homeDir, '.zshrc');
      const existingContent = dedentString(`
        # Existing zsh configuration
        export PATH=/usr/local/bin:$PATH
      `);

      await mockFileSystem.ensureDir(path.dirname(profilePath));
      await mockFileSystem.writeFile(profilePath, existingContent);

      const configs: ProfileUpdateConfig[] = [
        {
          shellType: 'zsh',
          generatedScriptPath: scriptPath,
          onlyIfExists: true,
          yamlConfigPath: testYamlConfigPath,
        },
      ];

      const results = await profileUpdater.updateProfiles(configs);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        shellType: 'zsh',
        profilePath: profilePath,
        fileExists: true,
        wasUpdated: true,
        wasAlreadyPresent: false,
      });

      // Check that the sourcing line was added
      const updatedContent = await mockFileSystem.readFile(profilePath);
      expect(updatedContent).toContain(existingContent);
      expect(updatedContent).toContain('# Generated via dotfiles generator - do not modify');
      expect(updatedContent).toContain('# /path/to/config.yaml');
      expect(updatedContent).toContain(
        '# ------------------------------------------------------------------------------'
      );
      expect(updatedContent).toContain(`source "${scriptPath}"`);
    });

    it('should not add source line if already present', async () => {
      const scriptPath = '/path/to/script.zsh';
      const profilePath = path.join(homeDir, '.zshrc');
      const existingContent = dedentString(`
        # Existing zsh configuration
        source "${scriptPath}"
        export PATH=/usr/local/bin:$PATH
      `);

      await mockFileSystem.ensureDir(path.dirname(profilePath));
      await mockFileSystem.writeFile(profilePath, existingContent);

      const configs: ProfileUpdateConfig[] = [
        {
          shellType: 'zsh',
          generatedScriptPath: scriptPath,
          onlyIfExists: true,
          yamlConfigPath: testYamlConfigPath,
        },
      ];

      const results = await profileUpdater.updateProfiles(configs);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        shellType: 'zsh',
        profilePath: profilePath,
        fileExists: true,
        wasUpdated: false,
        wasAlreadyPresent: true,
      });

      // Check that the content was not modified
      const finalContent = await mockFileSystem.readFile(profilePath);
      expect(finalContent).toBe(existingContent);
    });

    it('should handle multiple shell types', async () => {
      const zshScriptPath = '/path/to/script.zsh';
      const bashScriptPath = '/path/to/script.bash';

      // Create existing bash profile
      const bashProfilePath = path.join(homeDir, '.bashrc');
      await mockFileSystem.ensureDir(path.dirname(bashProfilePath));
      await mockFileSystem.writeFile(bashProfilePath, '# Existing bash config');

      const configs: ProfileUpdateConfig[] = [
        {
          shellType: 'zsh',
          generatedScriptPath: zshScriptPath,
          onlyIfExists: true,
          yamlConfigPath: testYamlConfigPath,
        },
        {
          shellType: 'bash',
          generatedScriptPath: bashScriptPath,
          onlyIfExists: true,
          yamlConfigPath: testYamlConfigPath,
        },
      ];

      const results = await profileUpdater.updateProfiles(configs);

      expect(results).toHaveLength(2);

      // Zsh profile doesn't exist, should be skipped
      expect(results[0]).toEqual({
        shellType: 'zsh',
        profilePath: path.join(homeDir, '.zshrc'),
        fileExists: false,
        wasUpdated: false,
        wasAlreadyPresent: false,
      });

      // Bash profile exists, should be updated
      expect(results[1]).toEqual({
        shellType: 'bash',
        profilePath: bashProfilePath,
        fileExists: true,
        wasUpdated: true,
        wasAlreadyPresent: false,
      });

      // Check bash profile was updated
      const bashContent = await mockFileSystem.readFile(bashProfilePath);
      expect(bashContent).toContain(`source "${bashScriptPath}"`);
    });

    it('should handle powershell profile with correct syntax', async () => {
      const scriptPath = '/path/to/script.ps1';
      const profilePath = path.join(homeDir, '.config/powershell/profile.ps1');

      const configs: ProfileUpdateConfig[] = [
        {
          shellType: 'powershell',
          generatedScriptPath: scriptPath,
          onlyIfExists: false,
          yamlConfigPath: testYamlConfigPath,
        },
      ];

      const results = await profileUpdater.updateProfiles(configs);

      expect(results).toHaveLength(1);
      expect(results[0]?.wasUpdated).toBe(true);

      // Check that PowerShell dot-source syntax is used
      const content = await mockFileSystem.readFile(profilePath);
      expect(content).toContain(`. "${scriptPath}"`);
      expect(content).toContain('# Generated via dotfiles generator - do not modify');
      expect(content).toContain('# /path/to/config.yaml');
      expect(content).toContain('# ------------------------------------------------------------------------------');
    });
  });
});
