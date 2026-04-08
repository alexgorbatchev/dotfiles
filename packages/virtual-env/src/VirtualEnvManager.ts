import type { IFileSystem } from "@dotfiles/file-system";
import type { TsLogger } from "@dotfiles/logger";
import path from "node:path";
import {
  CONFIG_FILE_NAME,
  DEFAULT_ENV_NAME,
  ENV_DIR_VAR,
  ENV_NAME_VAR,
  POWERSHELL_SOURCE_FILE_NAME,
  SOURCE_FILE_NAME,
  TOOLS_DIR_NAME,
} from "./constants";
import { generateDefaultConfig } from "./generateDefaultConfig";
import { generatePowerShellSourceScript } from "./generatePowerShellSourceScript";
import { generateSourceScript } from "./generateSourceScript";
import { messages } from "./log-messages";
import type { ActiveEnvResult, CreateEnvOptions, DetectEnvResult, EnvInfo, VirtualEnvResult } from "./types";

/**
 * Interface for the virtual environment manager.
 */
export interface IVirtualEnvManager {
  /**
   * Creates a new virtual environment.
   */
  create(options: CreateEnvOptions): Promise<VirtualEnvResult>;

  /**
   * Deletes an existing virtual environment.
   */
  delete(envDir: string): Promise<VirtualEnvResult>;

  /**
   * Gets information about an existing environment.
   */
  getEnvInfo(envDir: string): Promise<EnvInfo | null>;

  /**
   * Checks if a directory is a valid virtual environment.
   */
  isValidEnv(envDir: string): Promise<boolean>;

  /**
   * Detects a virtual environment in a directory.
   */
  detectEnv(searchDir: string, envName?: string): Promise<DetectEnvResult>;

  /**
   * Gets the currently active environment from environment variables.
   */
  getActiveEnv(): ActiveEnvResult;
}

/**
 * Manages dotfiles virtual environments.
 *
 * Handles creation, deletion, and detection of virtual environments
 * that provide isolated dotfiles configurations.
 */
export class VirtualEnvManager implements IVirtualEnvManager {
  constructor(
    private readonly parentLogger: TsLogger,
    private readonly fs: IFileSystem,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  private get logger(): TsLogger {
    return this.parentLogger.getSubLogger({ name: "VirtualEnvManager" });
  }

  /**
   * Creates a new virtual environment.
   *
   * @param options - Options for creating the environment
   * @returns Result indicating success or failure
   */
  async create(options: CreateEnvOptions): Promise<VirtualEnvResult> {
    const logger = this.logger.getSubLogger({ name: "create" });
    const envName = options.name;
    const envDir = path.resolve(options.parentDir, envName);

    logger.debug(messages.creatingEnv(envName));

    // Check if environment already exists
    if (await this.fs.exists(envDir)) {
      if (!options.force) {
        logger.warn(messages.envAlreadyExists(envDir));
        const result: VirtualEnvResult = { success: false, error: `Environment already exists at ${envDir}` };
        return result;
      }
      // Force mode: delete existing environment first
      await this.fs.rm(envDir, { recursive: true });
    }

    // Create environment directory structure
    await this.fs.ensureDir(envDir);

    // Create tools directory
    const toolsDir = path.join(envDir, TOOLS_DIR_NAME);
    await this.fs.ensureDir(toolsDir);
    logger.debug(messages.toolsDirCreated(toolsDir));

    // Generate and write source script (POSIX)
    const sourcePath = path.join(envDir, SOURCE_FILE_NAME);
    const sourceContent = generateSourceScript(envDir, envName);
    await this.fs.writeFile(sourcePath, sourceContent);
    await this.fs.chmod(sourcePath, 0o755);
    logger.debug(messages.sourceFileGenerated(sourcePath));

    // Generate and write PowerShell source script
    const psSourcePath = path.join(envDir, POWERSHELL_SOURCE_FILE_NAME);
    const psSourceContent = generatePowerShellSourceScript(envDir, envName);
    await this.fs.writeFile(psSourcePath, psSourceContent);
    logger.debug(messages.sourceFileGenerated(psSourcePath));

    // Generate and write config file
    const configPath = path.join(envDir, CONFIG_FILE_NAME);
    const configContent = generateDefaultConfig();
    await this.fs.writeFile(configPath, configContent);
    logger.debug(messages.configFileGenerated(configPath));

    logger.debug(messages.envCreated(envDir));
    const result: VirtualEnvResult = { success: true, envDir, envName };
    return result;
  }

  /**
   * Deletes an existing virtual environment.
   *
   * @param envDir - Path to the environment directory to delete
   * @returns Result indicating success or failure
   */
  async delete(envDir: string): Promise<VirtualEnvResult> {
    const logger = this.logger.getSubLogger({ name: "delete" });
    const envName = path.basename(envDir);

    // Check if environment exists
    if (!(await this.isValidEnv(envDir))) {
      logger.warn(messages.envNotFound(envDir));
      const result: VirtualEnvResult = { success: false, error: `Environment not found at ${envDir}` };
      return result;
    }

    logger.debug(messages.deletingEnv(envName));

    // Remove the entire environment directory
    await this.fs.rm(envDir, { recursive: true });

    logger.debug(messages.envDeleted(envDir));
    const result: VirtualEnvResult = { success: true, envDir, envName };
    return result;
  }

  /**
   * Gets information about an existing environment.
   *
   * @param envDir - Path to the environment directory
   * @returns Environment info or null if not a valid environment
   */
  async getEnvInfo(envDir: string): Promise<EnvInfo | null> {
    if (!(await this.isValidEnv(envDir))) {
      return null;
    }

    const result: EnvInfo = {
      envDir: path.resolve(envDir),
      name: path.basename(envDir),
      configPath: path.join(envDir, CONFIG_FILE_NAME),
      sourcePath: path.join(envDir, SOURCE_FILE_NAME),
      toolsDir: path.join(envDir, TOOLS_DIR_NAME),
    };
    return result;
  }

  /**
   * Checks if a directory is a valid virtual environment.
   *
   * A valid environment must have:
   * - A source file
   * - A dotfiles.config.ts file
   *
   * @param envDir - Path to check
   * @returns True if the directory is a valid environment
   */
  async isValidEnv(envDir: string): Promise<boolean> {
    const sourcePath = path.join(envDir, SOURCE_FILE_NAME);
    const configPath = path.join(envDir, CONFIG_FILE_NAME);

    const [sourceExists, configExists] = await Promise.all([this.fs.exists(sourcePath), this.fs.exists(configPath)]);

    return sourceExists && configExists;
  }

  /**
   * Detects a virtual environment in a directory.
   *
   * Searches for a directory with the given name (or default 'env')
   * that contains a valid environment structure.
   *
   * @param searchDir - Directory to search in
   * @param envName - Name of the environment to look for (defaults to 'env')
   * @returns Detection result
   */
  async detectEnv(searchDir: string, envName?: string): Promise<DetectEnvResult> {
    const logger = this.logger.getSubLogger({ name: "detectEnv" });
    const targetName = envName ?? DEFAULT_ENV_NAME;
    const envDir = path.resolve(searchDir, targetName);

    if (await this.isValidEnv(envDir)) {
      logger.debug(messages.envDetected(envDir));
      const result: DetectEnvResult = {
        found: true,
        envDir,
        envName: targetName,
        configPath: path.join(envDir, CONFIG_FILE_NAME),
      };
      return result;
    }

    const result: DetectEnvResult = { found: false };
    return result;
  }

  /**
   * Gets the currently active environment from environment variables.
   *
   * @returns Active environment info or inactive result
   */
  getActiveEnv(): ActiveEnvResult {
    const envDir = this.env[ENV_DIR_VAR];
    const envName = this.env[ENV_NAME_VAR];

    if (envDir && envName) {
      const result: ActiveEnvResult = { active: true, envDir, envName };
      return result;
    }

    const result: ActiveEnvResult = { active: false };
    return result;
  }
}
