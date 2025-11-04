import path from 'node:path';
import type { ShellType } from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import { generateProfileHeader, generateSourceLine } from '../shellTemplates';
import type { IProfileUpdater, ProfileUpdateConfig, ProfileUpdateResult } from './IProfileUpdater';

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

  async updateProfiles(configs: ProfileUpdateConfig[]): Promise<ProfileUpdateResult[]> {
    const results: ProfileUpdateResult[] = [];

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
  private async updateProfile(config: ProfileUpdateConfig): Promise<ProfileUpdateResult> {
    const profilePath = this.getProfilePath(config.shellType);
    const fileExists = await this.fileSystem.exists(profilePath);

    const result: ProfileUpdateResult = {
      shellType: config.shellType,
      profilePath,
      fileExists,
      wasUpdated: false,
      wasAlreadyPresent: false,
    };

    // Skip if file doesn't exist and onlyIfExists is true
    if (!fileExists && config.onlyIfExists) {
      return result;
    }

    // Check if sourcing line already exists
    if (fileExists) {
      const hasExistingLine = await this.hasSourceLine(profilePath, config.generatedScriptPath);
      if (hasExistingLine) {
        result.wasAlreadyPresent = true;
        return result;
      }
    }

    // Add or update the sourcing line
    await this.addSourceLine(profilePath, config);
    result.wasUpdated = true;

    return result;
  }

  /**
   * Adds a source line to the profile file.
   */
  private async addSourceLine(profilePath: string, config: ProfileUpdateConfig): Promise<void> {
    const sourceLine = generateSourceLine(config.shellType, config.generatedScriptPath);
    const headerBlock = generateProfileHeader(config.shellType, config.yamlConfigPath);

    let content = '';

    // Read existing content if file exists
    try {
      content = await this.fileSystem.readFile(profilePath);
    } catch (_error) {
      // File doesn't exist, start with empty content
      content = '';
    }

    // Ensure content ends with a newline before adding our lines
    if (content && !content.endsWith('\n')) {
      content += '\n';
    }

    // Add our sourcing section with enhanced header
    const newContent = `${content}\n${headerBlock}\n${sourceLine}\n`;

    // Ensure parent directory exists
    const parentDir = path.dirname(profilePath);
    await this.fileSystem.ensureDir(parentDir);

    // Write updated content
    await this.fileSystem.writeFile(profilePath, newContent);
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
