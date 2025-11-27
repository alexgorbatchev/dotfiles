import path from 'node:path';
import type { ShellType } from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import { generateProfileHeader, generateSourceLine } from '../shellTemplates';
import type { IProfileUpdateConfig, IProfileUpdateResult, IProfileUpdater } from './IProfileUpdater';

/**
 * Implementation of profile file updater that manages sourcing generated shell scripts
 * in shell-specific profile files.
 */
export class ProfileUpdater implements IProfileUpdater {
  private readonly fileSystem: IFileSystem;
  private readonly homeDir: string;

  constructor(fileSystem: IFileSystem, homeDir: string) {
    this.fileSystem = fileSystem;
    this.homeDir = homeDir;
  }

  async updateProfiles(configs: IProfileUpdateConfig[]): Promise<IProfileUpdateResult[]> {
    const results: IProfileUpdateResult[] = [];

    for (const config of configs) {
      const result = await this.updateProfile(config);
      results.push(result);
    }

    return results;
  }

  getProfilePath(shellType: ShellType): string {
    switch (shellType) {
      case 'zsh':
        return path.join(this.homeDir, '.zshrc');
      case 'bash':
        return path.join(this.homeDir, '.bashrc');
      case 'powershell':
        // PowerShell profile path varies by OS, use cross-platform approach
        return path.join(this.homeDir, '.config/powershell/profile.ps1');
      default:
        throw new Error(`Unsupported shell type: ${shellType}`);
    }
  }

  async hasSourceLine(profilePath: string, scriptPath: string): Promise<boolean> {
    try {
      const content = await this.fileSystem.readFile(profilePath);
      const sourcePatterns = this.getSourcePatterns(scriptPath);

      return sourcePatterns.some((pattern) => content.includes(pattern));
    } catch (_error) {
      // File doesn't exist or can't be read
      return false;
    }
  }

  /**
   * Updates a single profile file based on the provided configuration.
   */
  private async updateProfile(config: IProfileUpdateConfig): Promise<IProfileUpdateResult> {
    const profilePath = this.getProfilePath(config.shellType);
    const fileExists = await this.fileSystem.exists(profilePath);

    const result: IProfileUpdateResult = {
      shellType: config.shellType,
      profilePath,
      fileExists,
      wasUpdated: false,
      wasAlreadyPresent: false,
    };

    if (!fileExists && config.onlyIfExists) {
      return result;
    }

    let content = '';
    if (fileExists) {
      try {
        content = await this.fileSystem.readFile(profilePath);
      } catch (_error) {
        content = '';
      }
    }

    const sourceLine = generateSourceLine(config.shellType, config.generatedScriptPath);
    const headerBlock = generateProfileHeader(config.shellType, config.projectConfigPath);
    const newBlock = `${headerBlock}\n${sourceLine}`;

    const headerMarker = '# Generated via dotfiles generator - do not modify';
    if (content.includes(headerMarker)) {
      const newContent = this.replaceGeneratedBlocks(content, newBlock);
      if (newContent !== content) {
        await this.fileSystem.writeFile(profilePath, newContent);
        result.wasUpdated = true;
      } else {
        result.wasAlreadyPresent = true;
      }
      return result;
    }

    const sourcePatterns = this.getSourcePatterns(config.generatedScriptPath);
    if (sourcePatterns.some((pattern) => content.includes(pattern))) {
      result.wasAlreadyPresent = true;
      return result;
    }

    if (content && !content.endsWith('\n')) {
      content += '\n';
    }
    const finalContent = `${content}\n${newBlock}\n`;

    const parentDir = path.dirname(profilePath);
    await this.fileSystem.ensureDir(parentDir);

    await this.fileSystem.writeFile(profilePath, finalContent);
    result.wasUpdated = true;

    return result;
  }

  private replaceGeneratedBlocks(content: string, newBlock: string): string {
    const headerMarker = '# Generated via dotfiles generator - do not modify';
    const escapedMarker = headerMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const blockRegex = new RegExp(
      `${escapedMarker}[\\s\\S]*?^\\s*(?:source|\\.)\\s+["'].*?["'].*?$`,
      'gm'
    );

    const parts = content.split(blockRegex);
    let newContent = parts[0] || '';

    if (newContent && !newContent.endsWith('\n')) {
      newContent += '\n';
    }

    newContent += `${newBlock}\n`;

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      if (part) {
        newContent += part;
      }
    }

    return newContent;
  }

  /**
   * Gets possible source patterns to check for in profile files.
   */
  private getSourcePatterns(scriptPath: string): string[] {
    // Check for various ways the script might be sourced
    return [
      `source "${scriptPath}"`,
      `source '${scriptPath}'`,
      `source ${scriptPath}`,
      `. "${scriptPath}"`,
      `. '${scriptPath}'`,
      `. ${scriptPath}`,
    ];
  }
}
