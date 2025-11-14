import { beforeEach, describe, expect, it } from 'bun:test';
import path from 'node:path';
import type { YamlConfig } from '@dotfiles/config';
import type { ShellType, ToolConfig } from '@dotfiles/core';
import { always } from '@dotfiles/core';
import { createMemFileSystem, type IFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { createMockYamlConfig, createTestDirectories, type TestDirectories } from '@dotfiles/testing-helpers';
import { dedentString } from '@dotfiles/utils';
import type { GenerateShellInitOptions } from '../IShellInitGenerator';
import { ShellInitGenerator } from '../ShellInitGenerator';

describe('Profile Updates E2E Tests', () => {
  let mockFileSystem: IFileSystem;
  let mockAppConfig: YamlConfig;
  let generator: ShellInitGenerator;
  let logger: TestLogger;
  let testDirs: TestDirectories;
  let configFilePath: string;

  beforeEach(async () => {
    const { fs } = await createMemFileSystem({});
    mockFileSystem = fs;
    logger = new TestLogger();

    testDirs = await createTestDirectories(logger, mockFileSystem, { testName: 'profile-updates-e2e' });

    configFilePath = path.join(testDirs.paths.dotfilesDir, 'config.yaml');

    mockAppConfig = await createMockYamlConfig({
      config: {
        paths: testDirs.paths,
      },
      filePath: configFilePath,
      fileSystem: mockFileSystem,
      logger,
      systemInfo: { platform: 'linux', arch: 'x64', homeDir: testDirs.paths.homeDir },
      env: {},
    });

    generator = new ShellInitGenerator(logger, mockFileSystem, mockAppConfig);
  });

  describe('Complete Profile Update Workflow', () => {
    it('should generate shell scripts and update all existing profile files', async () => {
      // Setup: Create realistic tool configurations
      const toolConfigs: Record<string, ToolConfig> = {
        lazygit: {
          name: 'lazygit',
          binaries: ['lazygit'],
          version: '0.40.2',
          shellConfigs: {
            zsh: {
              scripts: [
                always`alias g="lazygit"`,
                always`export LAZYGIT_CONFIG_FILE="$HOME/.config/lazygit/config.yml"`,
              ],
            },
            bash: {
              scripts: [
                always`alias g="lazygit"`,
                always`export LAZYGIT_CONFIG_FILE="$HOME/.config/lazygit/config.yml"`,
              ],
            },
            powershell: {
              scripts: [
                always`Set-Alias g lazygit`,
                always`$env:LAZYGIT_CONFIG_FILE = "$HOME/.config/lazygit/config.yml"`,
              ],
            },
          },
          installationMethod: 'github-release',
          installParams: {
            repo: 'jesseduffield/lazygit',
          },
        },
        fzf: {
          name: 'fzf',
          binaries: ['fzf'],
          version: '0.44.1',
          shellConfigs: {
            zsh: {
              scripts: [
                always`export FZF_DEFAULT_OPTS="--height 40% --layout=reverse --border"`,
                always`export PATH="$HOME/.fzf/bin:$PATH"`,
              ],
              completions: { source: 'completion.zsh', name: '_fzf' },
            },
            bash: {
              scripts: [
                always`export FZF_DEFAULT_OPTS="--height 40% --layout=reverse --border"`,
                always`export PATH="$HOME/.fzf/bin:$PATH"`,
              ],
              completions: { source: 'completion.bash', name: 'fzf' },
            },
          },
          installationMethod: 'github-release',
          installParams: {
            repo: 'junegunn/fzf',
          },
        },
      };

      // Setup: Create existing shell profile files with realistic content
      const shellProfiles = {
        zsh: {
          path: path.join(testDirs.paths.homeDir, '.zshrc'),
          content: dedentString(`
            # Zsh configuration
            export ZSH="$HOME/.oh-my-zsh"
            ZSH_THEME="robbyrussell"
            plugins=(git docker kubectl)
            source $ZSH/oh-my-zsh.sh

            # User configuration
            export PATH="/usr/local/bin:$PATH"
            export EDITOR="vim"
          `),
        },
        bash: {
          path: path.join(testDirs.paths.homeDir, '.bashrc'),
          content: dedentString(`
            # Bash configuration
            export PS1='\\u@\\h:\\w\\$ '
            export PATH="/usr/local/bin:$PATH"
            export EDITOR="vim"

            # Aliases
            alias ll='ls -alF'
            alias la='ls -A'
          `),
        },
        powershell: {
          path: path.join(testDirs.paths.homeDir, '.config/powershell/profile.ps1'),
          content: dedentString(`
            # PowerShell configuration
            $PSDefaultParameterValues['Out-Default:OutVariable'] = '__'

            # Set location to home
            Set-Location ~

            # Custom prompt
            function prompt {
                Write-Host "PS " -NoNewline -ForegroundColor Green
                Write-Host (Get-Location).Path -NoNewline -ForegroundColor Blue
                Write-Host ">" -NoNewline -ForegroundColor Green
                " "
            }
          `),
        },
      };

      // Create all shell profile files
      for (const profile of Object.values(shellProfiles)) {
        await mockFileSystem.ensureDir(path.dirname(profile.path));
        await mockFileSystem.writeFile(profile.path, profile.content);
      }

      // Execute: Generate shell scripts with profile updates for all shell types
      const options: GenerateShellInitOptions = {
        shellTypes: ['zsh', 'bash', 'powershell'] as ShellType[],
        updateProfileFiles: true,
      };

      const result = await generator.generate(toolConfigs, options);

      // Verify: Generation was successful
      expect(result).not.toBeNull();
      expect(result?.files.size).toBe(3);
      expect(result?.profileUpdates).toBeDefined();
      expect(result?.profileUpdates).toHaveLength(3);

      // Verify: Generated shell script files exist and contain expected content
      const generatedFiles = [
        { shell: 'zsh', path: path.join(testDirs.paths.shellScriptsDir, 'main.zsh') },
        { shell: 'bash', path: path.join(testDirs.paths.shellScriptsDir, 'main.bash') },
        { shell: 'powershell', path: path.join(testDirs.paths.shellScriptsDir, 'main.ps1') },
      ];

      for (const { shell, path: scriptPath } of generatedFiles) {
        const scriptExists = await mockFileSystem.exists(scriptPath);
        expect(scriptExists).toBe(true);

        const scriptContent = await mockFileSystem.readFile(scriptPath);

        // Verify shell-specific content
        expect(scriptContent).toContain('# THIS FILE IS AUTOMATICALLY GENERATED');

        // Check shell-specific PATH syntax
        if (shell === 'powershell') {
          expect(scriptContent).toContain(`$env:PATH = "${testDirs.paths.binariesDir};$env:PATH"`);
          expect(scriptContent).toContain('Set-Alias g lazygit');
          expect(scriptContent).toContain('$env:LAZYGIT_CONFIG_FILE');
        } else {
          expect(scriptContent).toContain(`export PATH="${testDirs.paths.binariesDir}:$PATH"`);
          expect(scriptContent).toContain('alias g="lazygit"');
          expect(scriptContent).toContain('export LAZYGIT_CONFIG_FILE');
          expect(scriptContent).toContain('export FZF_DEFAULT_OPTS');
        }
      }

      // Verify: All profile files were updated with sourcing lines
      for (const profileUpdate of result!.profileUpdates!) {
        expect(profileUpdate.fileExists).toBe(true);
        expect(profileUpdate.wasUpdated).toBe(true);
        expect(profileUpdate.wasAlreadyPresent).toBe(false);

        // Read the updated profile file
        const profileContent = await mockFileSystem.readFile(profileUpdate.profilePath);

        // Verify the original content is preserved
        const originalProfile = shellProfiles[profileUpdate.shellType as keyof typeof shellProfiles];
        expect(profileContent).toContain(originalProfile.content);

        // Verify the sourcing line was added with correct syntax
        const expectedScriptPath = result!.files.get(profileUpdate.shellType)!;

        if (profileUpdate.shellType === 'powershell') {
          expect(profileContent).toContain(`. "${expectedScriptPath}"`);
        } else {
          expect(profileContent).toContain(`source "${expectedScriptPath}"`);
        }

        // Verify the header comments were added
        expect(profileContent).toContain('# Generated via dotfiles generator - do not modify');
        expect(profileContent).toContain(`# ${configFilePath}`);
        expect(profileContent).toContain(
          '# ------------------------------------------------------------------------------'
        );
      }

      // Verify: Profile files maintain proper structure
      const zshContent = await mockFileSystem.readFile(shellProfiles.zsh.path);
      const bashContent = await mockFileSystem.readFile(shellProfiles.bash.path);
      const psContent = await mockFileSystem.readFile(shellProfiles.powershell.path);

      // Original content should come first, then sourcing line at the end
      expect(zshContent.indexOf('export ZSH=')).toBeLessThan(zshContent.indexOf('# Generated via dotfiles generator'));
      expect(bashContent.indexOf('export PS1=')).toBeLessThan(
        bashContent.indexOf('# Generated via dotfiles generator')
      );
      expect(psContent.indexOf('$PSDefaultParameterValues')).toBeLessThan(
        psContent.indexOf('# Generated via dotfiles generator')
      );
    });

    it("should handle mixed scenarios: some profiles exist, some don't, some already have sourcing", async () => {
      const toolConfigs: Record<string, ToolConfig> = {
        testTool: {
          name: 'testTool',
          binaries: ['test-tool'],
          version: '1.0.0',
          shellConfigs: {
            zsh: { scripts: [always`export TEST_VAR="value"`] },
            bash: { scripts: [always`export TEST_VAR="value"`] },
          },
          installationMethod: 'manual',
          installParams: {},
        },
      };

      // Scenario setup:
      // - Zsh profile exists but is empty
      // - Bash profile exists and already has the sourcing line
      // - PowerShell profile doesn't exist

      const zshProfile = path.join(testDirs.paths.homeDir, '.zshrc');
      const bashProfile = path.join(testDirs.paths.homeDir, '.bashrc');
      const zshScriptPath = path.join(testDirs.paths.shellScriptsDir, 'main.zsh');
      const bashScriptPath = path.join(testDirs.paths.shellScriptsDir, 'main.bash');

      // Create zsh profile (empty)
      await mockFileSystem.ensureDir(path.dirname(zshProfile));
      await mockFileSystem.writeFile(zshProfile, '# Empty zsh config\n');

      // Create bash profile with existing sourcing line
      await mockFileSystem.ensureDir(path.dirname(bashProfile));
      await mockFileSystem.writeFile(bashProfile, `# Bash config\nsource "${bashScriptPath}"\n`);

      const options: GenerateShellInitOptions = {
        shellTypes: ['zsh', 'bash', 'powershell'],
        updateProfileFiles: true,
      };

      const result = await generator.generate(toolConfigs, options);

      expect(result).not.toBeNull();
      expect(result?.profileUpdates).toHaveLength(3);

      // Verify zsh profile was updated (existed but didn't have sourcing line)
      const zshUpdate = result?.profileUpdates?.find((u) => u.shellType === 'zsh');
      expect(zshUpdate).toEqual({
        shellType: 'zsh',
        profilePath: zshProfile,
        fileExists: true,
        wasUpdated: true,
        wasAlreadyPresent: false,
      });

      // Verify bash profile was not updated (already had sourcing line)
      const bashUpdate = result?.profileUpdates?.find((u) => u.shellType === 'bash');
      expect(bashUpdate).toEqual({
        shellType: 'bash',
        profilePath: bashProfile,
        fileExists: true,
        wasUpdated: false,
        wasAlreadyPresent: true,
      });

      // Verify PowerShell profile was not updated (didn't exist)
      const psProfile = path.join(testDirs.paths.homeDir, '.config/powershell/profile.ps1');
      const psUpdate = result?.profileUpdates?.find((u) => u.shellType === 'powershell');
      expect(psUpdate).toEqual({
        shellType: 'powershell',
        profilePath: psProfile,
        fileExists: false,
        wasUpdated: false,
        wasAlreadyPresent: false,
      });

      // Verify final state of files
      const finalZshContent = await mockFileSystem.readFile(zshProfile);
      const finalBashContent = await mockFileSystem.readFile(bashProfile);
      const psExists = await mockFileSystem.exists(psProfile);

      expect(finalZshContent).toContain(`source "${zshScriptPath}"`);
      expect(finalBashContent).toBe(`# Bash config\nsource "${bashScriptPath}"\n`); // Unchanged
      expect(psExists).toBe(false); // Still doesn't exist
    });

    it('should work with custom output paths and still update profiles correctly', async () => {
      const toolConfigs: Record<string, ToolConfig> = {
        customTool: {
          name: 'customTool',
          binaries: ['custom'],
          version: '1.0.0',
          shellConfigs: {
            zsh: { scripts: [always`export CUSTOM_VAR="test"`] },
          },
          installationMethod: 'manual',
          installParams: {},
        },
      };

      // Create existing zsh profile
      const zshProfile = path.join(testDirs.paths.homeDir, '.zshrc');
      await mockFileSystem.ensureDir(path.dirname(zshProfile));
      await mockFileSystem.writeFile(zshProfile, '# Existing config\n');

      // Use custom output path
      const customOutputPath = '/custom/location/my-shell-init.zsh';

      const options: GenerateShellInitOptions = {
        shellTypes: ['zsh'],
        outputPath: customOutputPath,
        updateProfileFiles: true,
      };

      const result = await generator.generate(toolConfigs, options);

      expect(result).not.toBeNull();
      expect(result?.primaryPath).toBe(customOutputPath);
      expect(result?.profileUpdates).toHaveLength(1);

      // Verify the profile was updated with the custom output path
      const profileUpdate = result?.profileUpdates?.[0];
      expect(profileUpdate?.wasUpdated).toBe(true);

      const profileContent = await mockFileSystem.readFile(zshProfile);
      expect(profileContent).toContain(`source "${customOutputPath}"`);
      expect(profileContent).not.toContain(path.join(testDirs.paths.shellScriptsDir, 'main.zsh'));
    });

    it('should generate comprehensive shell script content and update profiles for real-world scenario', async () => {
      // Complex tool configuration with multiple features
      const toolConfigs: Record<string, ToolConfig> = {
        neovim: {
          name: 'neovim',
          binaries: ['nvim'],
          version: '0.9.5',
          shellConfigs: {
            zsh: {
              scripts: [
                always`export EDITOR="nvim"`,
                always`export VISUAL="nvim"`,
                always`alias vim="nvim"`,
                always`alias vi="nvim"`,
              ],
            },
            bash: {
              scripts: [
                always`export EDITOR="nvim"`,
                always`export VISUAL="nvim"`,
                always`alias vim="nvim"`,
                always`alias vi="nvim"`,
              ],
            },
          },
          installationMethod: 'github-release',
          installParams: {
            repo: 'neovim/neovim',
          },
        },
        ripgrep: {
          name: 'ripgrep',
          binaries: ['rg'],
          version: '13.0.0',
          shellConfigs: {
            zsh: {
              scripts: [
                always`export RIPGREP_CONFIG_PATH="$HOME/.config/ripgrep/config"`,
                always`export PATH="$HOME/.cargo/bin:$PATH"`,
              ],
            },
            bash: {
              scripts: [
                always`export RIPGREP_CONFIG_PATH="$HOME/.config/ripgrep/config"`,
                always`export PATH="$HOME/.cargo/bin:$PATH"`,
              ],
            },
          },
          installationMethod: 'github-release',
          installParams: {
            repo: 'BurntSushi/ripgrep',
          },
        },
        bat: {
          name: 'bat',
          binaries: ['bat'],
          version: '0.24.0',
          shellConfigs: {
            zsh: {
              scripts: [always`export BAT_THEME="ansi"`, always`alias cat="bat"`],
              completions: { source: 'bat.zsh', name: '_bat' },
            },
            bash: {
              scripts: [always`export BAT_THEME="ansi"`, always`alias cat="bat"`],
              completions: { source: 'bat.bash', name: 'bat' },
            },
          },
          installationMethod: 'github-release',
          installParams: {
            repo: 'sharkdp/bat',
          },
        },
      };

      // Create realistic shell profiles
      const zshProfile = path.join(testDirs.paths.homeDir, '.zshrc');
      const bashProfile = path.join(testDirs.paths.homeDir, '.bashrc');

      await mockFileSystem.ensureDir(path.dirname(zshProfile));
      await mockFileSystem.writeFile(
        zshProfile,
        dedentString(`
        # Zsh Configuration
        autoload -Uz compinit
        compinit

        # History settings
        HISTSIZE=10000
        SAVEHIST=10000
        setopt APPEND_HISTORY
        setopt INC_APPEND_HISTORY
        setopt SHARE_HISTORY

        # Existing PATH modification
        export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
      `)
      );

      await mockFileSystem.ensureDir(path.dirname(bashProfile));
      await mockFileSystem.writeFile(
        bashProfile,
        dedentString(`
        # Bash Configuration
        shopt -s histappend
        HISTSIZE=10000
        HISTFILESIZE=20000

        # Color support
        if [ -x /usr/bin/dircolors ]; then
            test -r ~/.dircolors && eval "$(dircolors -b ~/.dircolors)" || eval "$(dircolors -b)"
        fi

        # Existing aliases
        alias grep='grep --color=auto'
      `)
      );

      const options: GenerateShellInitOptions = {
        shellTypes: ['zsh', 'bash'],
        updateProfileFiles: true,
      };

      const result = await generator.generate(toolConfigs, options);

      // Verify generation success
      expect(result).not.toBeNull();
      expect(result?.files.size).toBe(2);
      expect(result?.profileUpdates).toHaveLength(2);

      // Verify generated scripts contain all expected content
      const zshScriptPath = result?.files.get('zsh');
      const bashScriptPath = result?.files.get('bash');

      expect(zshScriptPath).toBeDefined();
      expect(bashScriptPath).toBeDefined();

      const zshScriptContent = await mockFileSystem.readFile(zshScriptPath!);
      // Bash script should have similar structure to zsh

      // Check hoisted PATH modifications
      expect(zshScriptContent).toContain(
        '# ============================= PATH Modifications =============================='
      );
      expect(zshScriptContent).toContain(`export PATH="${testDirs.paths.binariesDir}:$PATH"`);
      expect(zshScriptContent).toContain('export PATH="$HOME/.cargo/bin:$PATH"');

      // Check always scripts section
      expect(zshScriptContent).toContain(
        '# =============================== Always Scripts ================================'
      );
      expect(zshScriptContent).toContain('export EDITOR="nvim"');
      expect(zshScriptContent).toContain('export VISUAL="nvim"');
      expect(zshScriptContent).toContain('export RIPGREP_CONFIG_PATH');
      expect(zshScriptContent).toContain('export BAT_THEME="ansi"');

      // All scripts are now in the Always Scripts section
      expect(zshScriptContent).toContain('alias vim="nvim"');
      expect(zshScriptContent).toContain('alias vi="nvim"');
      expect(zshScriptContent).toContain('alias cat="bat"');

      // Check completions section (only for zsh in this case)
      expect(zshScriptContent).toContain(
        '# =========================== Shell Completions Setup ==========================='
      );
      expect(zshScriptContent).toContain('typeset -U fpath');

      // Verify both profiles were updated
      for (const update of result!.profileUpdates!) {
        expect(update.wasUpdated).toBe(true);
        expect(update.fileExists).toBe(true);
      }

      // Verify profile content preservation and sourcing addition
      const updatedZshContent = await mockFileSystem.readFile(zshProfile);
      const updatedBashContent = await mockFileSystem.readFile(bashProfile);

      // Original content should be preserved
      expect(updatedZshContent).toContain('autoload -Uz compinit');
      expect(updatedZshContent).toContain('HISTSIZE=10000');
      expect(updatedBashContent).toContain('shopt -s histappend');
      expect(updatedBashContent).toContain('alias grep=');

      // Sourcing lines should be added
      expect(updatedZshContent).toContain(`source "${zshScriptPath!}"`);
      expect(updatedBashContent).toContain(`source "${bashScriptPath!}"`);
    });
  });
});
