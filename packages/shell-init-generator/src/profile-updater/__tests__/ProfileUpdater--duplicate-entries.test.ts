import { describe, expect, it, beforeEach } from 'bun:test';
import { createMemFileSystem, type IFileSystem } from '@dotfiles/file-system';
import { ProfileUpdater } from '../ProfileUpdater';
import type { IProfileUpdateConfig } from '../IProfileUpdater';

describe('ProfileUpdater - Duplicate Entries', () => {
  let fs: IFileSystem;
  let updater: ProfileUpdater;
  const homeDir = '/home/user';

  beforeEach(async () => {
    const result = await createMemFileSystem({});
    fs = result.fs;
    updater = new ProfileUpdater(fs, homeDir);
  });

  it('should replace existing entry instead of appending when updating from a different project', async () => {
    const zshrcPath = `${homeDir}/.zshrc`;
    const oldConfigPath = '/old/project/config.ts';
    const oldScriptPath = '/old/project/.generated/shell-init/main.zsh';
    
    // Simulate existing content from a previous run (or different project)
    const existingContent = [
      '# Some user content',
      'export FOO=bar',
      '',
      '# Generated via dotfiles generator - do not modify',
      `# ${oldConfigPath}`,
      '# ------------------------------------------------------------------------------',
      `source "${oldScriptPath}"`,
      '',
      '# More user content'
    ].join('\n');

    await fs.ensureDir(homeDir);
    await fs.writeFile(zshrcPath, existingContent);

    const newConfigPath = '/new/project/config.ts';
    const newScriptPath = '/new/project/.generated/shell-init/main.zsh';

    const config: IProfileUpdateConfig = {
      shellType: 'zsh',
      projectConfigPath: newConfigPath,
      generatedScriptPath: newScriptPath,
      onlyIfExists: false
    };

    await updater.updateProfiles([config]);

    const content = await fs.readFile(zshrcPath);
    
    // Should contain the new script path
    expect(content).toContain(`source "${newScriptPath}"`);
    
    // Should NOT contain the old script path (it should be replaced)
    expect(content).not.toContain(`source "${oldScriptPath}"`);
    
    // Should NOT contain duplicate headers
    const headerMatches = content.match(/# Generated via dotfiles generator - do not modify/g);
    expect(headerMatches).toHaveLength(1);
  });
});
