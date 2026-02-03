import type { ProjectConfig } from '@dotfiles/config';
import type { IPluginShellInit, ShellType, ToolConfig } from '@dotfiles/core';
import { getScriptContent, isAlwaysScript, isOnceScript, isRawScript } from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import type { Emission } from '@dotfiles/shell-emissions';
import { alias, environment, fn, script, withSource } from '@dotfiles/shell-emissions';
import { resolvePlatformConfig } from '@dotfiles/utils';
import path from 'node:path';
import type { IGenerateShellInitOptions, IShellInitGenerationResult, IShellInitGenerator } from './IShellInitGenerator';
import { messages } from './log-messages';
import { type IProfileUpdateConfig, ProfileUpdater } from './profile-updater';
import {
  createGenerator,
  type IAdditionalShellFile,
  type IShellGenerator,
} from './shell-generators';

/**
 * Service that generates shell initialization scripts for installed tools.
 *
 * This class orchestrates the creation of shell-specific initialization files (e.g., .zshrc, .bashrc)
 * that configure the environment for installed tools. It consolidates all tool-specific shell
 * configurations into optimized, generated scripts that can be sourced by the user's shell.
 *
 * **Key Responsibilities:**
 * - Generate shell-specific initialization files for multiple shells (zsh, bash, PowerShell)
 * - Aggregate shell configurations from all installed tools
 * - Handle shell completions and custom scripts
 * - Update user profile files to source generated scripts
 * - Support platform-specific configurations
 *
 * **Generated Content:**
 * - Environment variables from tool configurations
 * - Aliases and shell functions
 * - PATH modifications for tool binaries
 * - Shell completion scripts
 * - Custom initialization scripts (run once or always)
 *
 * **Profile Integration:**
 * Optionally updates the user's shell profile files (e.g., ~/.zshrc, ~/.bashrc) to automatically
 * source the generated initialization scripts. This ensures tools are available in new shell sessions.
 */
export class ShellInitGenerator implements IShellInitGenerator {
  private readonly fs: IFileSystem;
  private readonly projectConfig: ProjectConfig;
  private readonly logger: TsLogger;

  constructor(parentLogger: TsLogger, fileSystem: IFileSystem, projectConfig: ProjectConfig) {
    this.logger = parentLogger.getSubLogger({ name: 'ShellInitGenerator' });
    const logger = this.logger.getSubLogger({ name: 'constructor' });
    logger.debug(messages.constructor.initialized());
    this.fs = fileSystem;
    this.projectConfig = projectConfig;
  }

  async generate(
    toolConfigs: Record<string, ToolConfig>,
    options?: IGenerateShellInitOptions,
  ): Promise<IShellInitGenerationResult | null> {
    const logger = this.logger.getSubLogger({ name: 'generate' });
    const shellTypes: ShellType[] = options?.shellTypes ?? ['zsh'];
    const generatedFiles = new Map<ShellType, string>();
    let primaryPath: string | null = null;

    const toolConfigsCount = toolConfigs ? Object.keys(toolConfigs).length : 0;
    logger.debug(messages.generate.parsedToolCount(toolConfigsCount));

    for (const shellType of shellTypes) {
      const result = await this.generateForShellType(shellType, toolConfigs, options);
      if (result) {
        generatedFiles.set(shellType, result.outputPath);
        if (primaryPath === null) {
          primaryPath = result.outputPath;
        }
      }
    }

    if (generatedFiles.size === 0) {
      return null;
    }

    const result: IShellInitGenerationResult = {
      files: generatedFiles,
      primaryPath,
    };

    const shouldUpdateProfiles = options?.updateProfileFiles ?? true;
    if (shouldUpdateProfiles) {
      result.profileUpdates = await this.updateProfileFiles(generatedFiles);
    }

    return result;
  }

  private async generateForShellType(
    shellType: ShellType,
    toolConfigs: Record<string, ToolConfig>,
    options?: IGenerateShellInitOptions,
  ): Promise<{ outputPath: string; } | null> {
    const logger = this.logger.getSubLogger({ name: 'generateForShellType' });
    try {
      const generator = createGenerator(shellType, this.projectConfig);
      const outputPath = options?.outputPath ?? generator.getDefaultOutputPath();
      logger.debug(messages.generate.resolvedOutputPath(outputPath));

      const toolEmissions = this.extractToolEmissions(toolConfigs, generator, options);
      const fileContent = generator.generateFileContent(toolEmissions);

      await this.cleanupOnceScriptsDirectory(shellType);
      const additionalFiles = generator.getAdditionalFiles(toolEmissions);

      const writeResult = await this.writeShellFiles(outputPath, fileContent, additionalFiles);
      return writeResult ? { outputPath } : null;
    } catch (error: unknown) {
      logger.debug(messages.generate.shellTypeFailure(shellType), error);
      return null;
    }
  }

  /**
   * Extracts emissions from all tool configurations.
   */
  private extractToolEmissions(
    toolConfigs: Record<string, ToolConfig>,
    generator: IShellGenerator,
    options?: IGenerateShellInitOptions,
  ): Map<string, Emission[]> {
    const toolEmissions = new Map<string, Emission[]>();

    for (const toolName in toolConfigs) {
      const config = toolConfigs[toolName];
      if (!config) {
        continue;
      }

      const resolvedConfig = options?.systemInfo ? resolvePlatformConfig(config, options.systemInfo) : config;
      const emissions = generator.extractEmissions(resolvedConfig);

      // Merge plugin-emitted shell init if present
      const pluginShellInit = options?.pluginShellInit?.[toolName]?.[generator.shellType];
      if (pluginShellInit) {
        const pluginEmissions = this.convertPluginShellInit(pluginShellInit, resolvedConfig.configFilePath);
        emissions.push(...pluginEmissions);
      }

      if (emissions.length > 0) {
        toolEmissions.set(toolName, emissions);
      }
    }

    return toolEmissions;
  }

  /**
   * Converts plugin-emitted shell initialization content to typed emissions.
   */
  private convertPluginShellInit(pluginInit: IPluginShellInit, configFilePath?: string): Emission[] {
    const emissions: Emission[] = [];
    const source = configFilePath;

    // Convert environment variables
    if (pluginInit.environmentVariables) {
      const emission = environment(pluginInit.environmentVariables);
      emissions.push(source ? withSource(emission, source) : emission);
    }

    // Convert aliases
    if (pluginInit.aliases) {
      const emission = alias(pluginInit.aliases);
      emissions.push(source ? withSource(emission, source) : emission);
    }

    // Convert scripts
    if (pluginInit.scripts) {
      for (const shellScript of pluginInit.scripts) {
        const scriptContent = getScriptContent(shellScript);
        let emission: Emission | undefined;

        if (isOnceScript(shellScript)) {
          emission = script(scriptContent, 'once', true);
        } else if (isAlwaysScript(shellScript)) {
          emission = script(scriptContent, 'always', true);
        } else if (isRawScript(shellScript)) {
          emission = script(scriptContent, 'raw', false);
        }

        if (emission) {
          emissions.push(source ? withSource(emission, source) : emission);
        }
      }
    }

    // Convert functions
    if (pluginInit.functions) {
      for (const [funcName, funcBody] of Object.entries(pluginInit.functions)) {
        const emission = fn(funcName, funcBody, true);
        emissions.push(source ? withSource(emission, source) : emission);
      }
    }

    return emissions;
  }

  private async writeShellFiles(
    outputPath: string,
    fileContent: string,
    additionalFiles: IAdditionalShellFile[],
  ): Promise<boolean> {
    const logger = this.logger.getSubLogger({ name: 'writeShellFiles' });
    try {
      await this.fs.ensureDir(path.dirname(outputPath));
      await this.fs.writeFile(outputPath, fileContent);

      for (const additionalFile of additionalFiles) {
        await this.writeAdditionalFile(additionalFile);
      }

      return true;
    } catch (error: unknown) {
      logger.debug(messages.generate.writeFailure(outputPath), error);
      return false;
    }
  }

  private async writeAdditionalFile(additionalFile: IAdditionalShellFile): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'writeAdditionalFile' });
    try {
      await this.fs.ensureDir(path.dirname(additionalFile.outputPath));
      await this.fs.writeFile(additionalFile.outputPath, additionalFile.content);
    } catch (error: unknown) {
      logger.debug(messages.generate.writeFailure(additionalFile.outputPath), error);
    }
  }

  /**
   * Updates shell profile files to source the generated shell scripts.
   * @param generatedFiles - Map of shell type to generated file path
   * @returns Promise resolving to array of profile update results
   */
  private async updateProfileFiles(generatedFiles: Map<ShellType, string>) {
    const logger = this.logger.getSubLogger({ name: 'updateProfileFiles' });
    const profileUpdater = new ProfileUpdater(this.fs, this.projectConfig.paths.homeDir);
    const shellInstallConfig = this.projectConfig.features.shellInstall;

    if (!shellInstallConfig) {
      logger.debug(messages.profiles.skipped('all' as ShellType));
      return [];
    }

    const configs: IProfileUpdateConfig[] = [];
    for (const [shellType, scriptPath] of generatedFiles) {
      let profilePath: string | undefined;

      if (shellType === 'zsh') {
        profilePath = shellInstallConfig?.zsh;
      } else if (shellType === 'bash') {
        profilePath = shellInstallConfig?.bash;
      } else if (shellType === 'powershell') {
        profilePath = shellInstallConfig?.powershell;
      }

      if (!profilePath) {
        logger.debug(messages.profiles.skipped(shellType));
        continue;
      }

      if (profilePath?.startsWith('~/')) {
        profilePath = path.join(this.projectConfig.paths.homeDir, profilePath.slice(2));
      } else if (profilePath === '~') {
        profilePath = this.projectConfig.paths.homeDir;
      }

      configs.push({
        shellType,
        generatedScriptPath: scriptPath,
        onlyIfExists: true, // Only update profile files if they already exist
        projectConfigPath: this.projectConfig.configFilePath,
        profilePath,
      });
    }

    logger.debug(messages.profiles.starting(configs.length));
    return await profileUpdater.updateProfiles(configs);
  }

  /**
   * Cleans up the once scripts directory for a specific shell type by removing all existing files.
   * This ensures that removed or changed once scripts don't remain from previous generations.
   * @param shellType - The shell type to clean up once scripts for
   */
  private async cleanupOnceScriptsDirectory(shellType: ShellType): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'cleanupOnceScriptsDirectory' });
    const onceDir = path.join(this.projectConfig.paths.shellScriptsDir, '.once');

    try {
      const onceDirExists = await this.fs.exists(onceDir);
      if (!onceDirExists) {
        return;
      }

      const extension = this.getShellExtension(shellType);
      const files = await this.fs.readdir(onceDir);

      // Filter to only files matching this shell type and remove them
      for (const file of files) {
        if (file.endsWith(`.${extension}`)) {
          const filePath = path.join(onceDir, file);
          await this.fs.rm(filePath);
          logger.debug(messages.cleanup.onceScriptRemoved(filePath));
        }
      }
    } catch (error: unknown) {
      logger.debug(messages.cleanup.failure(onceDir), error);
      // Continue generation even if cleanup fails
    }
  }

  /**
   * Gets the file extension for a shell type
   * @param shellType - The shell type
   * @returns The file extension for the shell
   */
  private getShellExtension(shellType: ShellType): string {
    switch (shellType) {
      case 'zsh':
        return 'zsh';
      case 'bash':
        return 'bash';
      case 'powershell':
        return 'ps1';
      default:
        throw new Error(`Unsupported shell type: ${shellType}`);
    }
  }
}
