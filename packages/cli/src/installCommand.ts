import type { IConfigService, ILoadToolConfigByBinaryError, ProjectConfig } from "@dotfiles/config";
import type { ISystemInfo, ToolConfig } from "@dotfiles/core";
import type { IResolvedFileSystem } from "@dotfiles/file-system";
import { getBinaryNames, type InstallResult } from "@dotfiles/installer";
import type { TsLogger } from "@dotfiles/logger";
import { expandToolConfigPath, exitCli, resolvePlatformConfig } from "@dotfiles/utils";
import path from "node:path";
import { messages } from "./log-messages";
import type {
  ICommandCompletionMeta,
  IGlobalProgram,
  IGlobalProgramOptions,
  IInstallCommandSpecificOptions,
  IServices,
  ServicesFactory,
} from "./types";

/**
 * Completion metadata for the install command.
 */
export const INSTALL_COMMAND_COMPLETION: ICommandCompletionMeta = {
  name: "install",
  description: "Install a tool by name or binary",
  hasPositionalArg: true,
  positionalArgDescription: "tool name or binary name to install",
  positionalArgType: "tool",
  options: [
    { flag: "--force", description: "Force installation even if already installed" },
    { flag: "--shim-mode", description: "Optimized output for shim usage" },
  ],
};

/**
 * Result of loading a tool configuration.
 * Returns the tool config and actual tool name (which may differ from input if looked up by binary).
 */
type LoadToolConfigResult =
  | { success: true; toolConfig: ToolConfig; toolName: string }
  | { success: false; error: string };

type InstallCommandOptions = IInstallCommandSpecificOptions & IGlobalProgramOptions;

interface IArtifactValidationResult {
  hasIssues: boolean;
  issues: string[];
}

interface IArtifactReconciliationOptions {
  version?: string;
  binaryPaths?: string[];
}

interface IOperationResultSummary {
  success: boolean;
  error?: string;
}

/**
 * Type guard to check if a result from loadToolConfigByBinary is an error object.
 */
function isConfigByBinaryError(result: unknown): result is ILoadToolConfigByBinaryError {
  return typeof result === "object" && result !== null && "error" in result;
}

/**
 * Loads a tool configuration by name or binary name.
 *
 * First attempts to load by tool name (filename without .tool.ts extension).
 * If not found, attempts to find a tool that provides a binary with the given name.
 *
 * @param logger - Logger instance for logging operations.
 * @param nameOrBinary - The tool name or binary name to search for.
 * @param toolConfigsDir - Directory containing tool configuration files.
 * @param fs - File system interface for reading configuration files.
 * @param projectConfig - Parsed project configuration object.
 * @param configService - Configuration service for loading tool configs.
 * @param systemInfo - System information for context creation.
 * @returns Result object with tool config and actual tool name, or error message.
 */
async function loadToolConfigByNameOrBinary(
  logger: TsLogger,
  nameOrBinary: string,
  toolConfigsDir: string,
  fs: IResolvedFileSystem,
  projectConfig: ProjectConfig,
  configService: IConfigService,
  systemInfo: ISystemInfo,
): Promise<LoadToolConfigResult> {
  // First, try to load by exact tool name
  const toolConfig = await configService.loadSingleToolConfig(
    logger,
    nameOrBinary,
    toolConfigsDir,
    fs,
    projectConfig,
    systemInfo,
  );

  if (toolConfig) {
    const result: LoadToolConfigResult = { success: true, toolConfig, toolName: nameOrBinary };
    return result;
  }

  // Not found by tool name, try to find by binary name
  logger.debug(messages.toolLookupByBinaryStarted(nameOrBinary));
  const binaryLookupResult = await configService.loadToolConfigByBinary(
    logger,
    nameOrBinary,
    toolConfigsDir,
    fs,
    projectConfig,
    systemInfo,
  );

  if (isConfigByBinaryError(binaryLookupResult)) {
    const result: LoadToolConfigResult = { success: false, error: binaryLookupResult.error };
    return result;
  }

  if (binaryLookupResult) {
    logger.debug(messages.toolFoundByBinary(nameOrBinary, binaryLookupResult.name));
    const result: LoadToolConfigResult = {
      success: true,
      toolConfig: binaryLookupResult,
      toolName: binaryLookupResult.name,
    };
    return result;
  }

  // Not found by either method
  const result: LoadToolConfigResult = {
    success: false,
    error: `No tool or binary named "${nameOrBinary}" found in ${toolConfigsDir}`,
  };
  return result;
}

async function pathExists(fs: IResolvedFileSystem, filePath: string, useLstat: boolean = false): Promise<boolean> {
  if (useLstat) {
    try {
      await fs.lstat(filePath);
      return true;
    } catch {
      return false;
    }
  }

  return fs.exists(filePath);
}

function getExternalShimPaths(toolConfig: ToolConfig, projectConfig: ProjectConfig): string[] {
  return getBinaryNames(toolConfig.binaries).map((binaryName) => path.join(projectConfig.paths.targetDir, binaryName));
}

async function validateShimArtifacts(
  toolConfig: ToolConfig,
  projectConfig: ProjectConfig,
  fs: IResolvedFileSystem,
  isExternallyManaged: boolean,
): Promise<string[]> {
  const issues: string[] = [];
  const shimPaths = getExternalShimPaths(toolConfig, projectConfig);

  for (const shimPath of shimPaths) {
    const shimExists = await pathExists(fs, shimPath, true);

    if (isExternallyManaged) {
      if (shimExists) {
        issues.push(`stale shim at ${shimPath}`);
      }
      continue;
    }

    if (!shimExists) {
      issues.push(`missing shim at ${shimPath}`);
    }
  }

  return issues;
}

async function validateSymlinkArtifacts(
  toolConfig: ToolConfig,
  projectConfig: ProjectConfig,
  systemInfo: ISystemInfo,
  fs: IResolvedFileSystem,
): Promise<string[]> {
  const issues: string[] = [];

  if (!toolConfig.symlinks || toolConfig.symlinks.length === 0) {
    return issues;
  }

  for (const symlink of toolConfig.symlinks) {
    const sourcePath = expandToolConfigPath(toolConfig.configFilePath, symlink.source, projectConfig, systemInfo);
    const targetPath = expandToolConfigPath(toolConfig.configFilePath, symlink.target, projectConfig, systemInfo);

    try {
      const targetStats = await fs.lstat(targetPath);
      if (!targetStats.isSymbolicLink()) {
        issues.push(`expected symlink at ${targetPath}`);
        continue;
      }

      const linkTarget = await fs.readlink(targetPath);
      const resolvedLinkTarget = path.resolve(path.dirname(targetPath), linkTarget);
      if (resolvedLinkTarget !== sourcePath) {
        issues.push(`symlink target mismatch at ${targetPath}`);
      }
    } catch {
      issues.push(`missing symlink at ${targetPath}`);
    }
  }

  return issues;
}

async function validateCopyArtifacts(
  toolConfig: ToolConfig,
  projectConfig: ProjectConfig,
  systemInfo: ISystemInfo,
  fs: IResolvedFileSystem,
): Promise<string[]> {
  const issues: string[] = [];

  if (!toolConfig.copies || toolConfig.copies.length === 0) {
    return issues;
  }

  for (const copy of toolConfig.copies) {
    const targetPath = expandToolConfigPath(toolConfig.configFilePath, copy.target, projectConfig, systemInfo);
    const targetExists = await pathExists(fs, targetPath);

    if (!targetExists) {
      issues.push(`missing copy at ${targetPath}`);
    }
  }

  return issues;
}

async function validateToolArtifacts(toolConfig: ToolConfig, services: IServices): Promise<IArtifactValidationResult> {
  const resolvedToolConfig = resolvePlatformConfig(toolConfig, services.systemInfo);
  const externallyManagedMethods = services.pluginRegistry.getExternallyManagedMethods();
  const isExternallyManaged = externallyManagedMethods.has(resolvedToolConfig.installationMethod);

  const shimIssues = await validateShimArtifacts(
    resolvedToolConfig,
    services.projectConfig,
    services.fs,
    isExternallyManaged,
  );
  const symlinkIssues = await validateSymlinkArtifacts(
    resolvedToolConfig,
    services.projectConfig,
    services.systemInfo,
    services.fs,
  );
  const copyIssues = await validateCopyArtifacts(
    resolvedToolConfig,
    services.projectConfig,
    services.systemInfo,
    services.fs,
  );
  const issues = [...shimIssues, ...symlinkIssues, ...copyIssues];

  return {
    hasIssues: issues.length > 0,
    issues,
  };
}

function getFirstFailureError(results: IOperationResultSummary[]): string | null {
  for (const result of results) {
    if (!result.success) {
      return result.error ?? "Operation failed";
    }
  }

  return null;
}

async function reconcileToolArtifacts(
  logger: TsLogger,
  toolName: string,
  toolConfig: ToolConfig,
  services: IServices,
  options: IArtifactReconciliationOptions = {},
): Promise<boolean> {
  const validationBefore = await validateToolArtifacts(toolConfig, services);
  const resolvedToolConfig = resolvePlatformConfig(toolConfig, services.systemInfo);
  const externallyManagedMethods = services.pluginRegistry.getExternallyManagedMethods();
  const isExternallyManaged = externallyManagedMethods.has(resolvedToolConfig.installationMethod);

  if (isExternallyManaged) {
    await deleteShimsForTool(resolvedToolConfig, services.projectConfig.paths.targetDir, services.fs, logger);
  } else {
    await services.shimGenerator.generateForTool(toolName, toolConfig, {
      overwrite: false,
      overwriteConflicts: false,
    });
  }

  await services.generatorOrchestrator.generateCompletionsForTool(
    toolName,
    toolConfig,
    options.version,
    options.binaryPaths,
  );

  const symlinkResults = await services.symlinkGenerator.generate(
    { [toolName]: toolConfig },
    { overwrite: true, backup: true },
  );
  const symlinkError = getFirstFailureError(symlinkResults);
  if (symlinkError) {
    throw new Error(symlinkError);
  }

  const copyResults = await services.copyGenerator.generate(
    { [toolName]: toolConfig },
    { overwrite: true, backup: true },
  );
  const copyError = getFirstFailureError(copyResults);
  if (copyError) {
    throw new Error(copyError);
  }

  const validationAfter = await validateToolArtifacts(toolConfig, services);
  if (validationAfter.hasIssues) {
    throw new Error(`Failed to reconcile artifacts for "${toolName}": ${validationAfter.issues.join(", ")}`);
  }

  return validationBefore.hasIssues;
}

function handleInstallationResult(
  logger: TsLogger,
  result: InstallResult,
  toolName: string,
  shimMode: boolean,
  artifactsWereBroken: boolean,
): number | null {
  if (result.success) {
    if (shimMode) {
      // In shim mode, exit silently on success
      return 0;
    } else {
      // Normal mode: log success message and continue (don't exit)
      const actualMethod = result.installationMethod ?? "unknown";
      const version = result.version ?? "unknown";
      if (actualMethod === "already-installed") {
        if (artifactsWereBroken) {
          logger.info(messages.toolArtifactsRepaired(toolName));
        } else {
          logger.info(messages.toolAlreadyInstalled(toolName, version));
        }
      } else {
        logger.info(messages.toolInstalled(toolName, version, actualMethod));
      }
      return null; // Don't exit on success in normal mode
    }
  } else {
    // Error already logged by Installer - just return exit code
    return 1;
  }
}

function handleInstallationError(logger: TsLogger, error: Error, toolName: string, shimMode: boolean): number {
  if (shimMode) {
    // In shim mode, output user-friendly error message to stderr only
    process.stderr.write(`Failed to install '${toolName}': ${error.message}\n`);
  } else {
    // Normal mode: use logger only
    logger.error(messages.commandExecutionFailed("install", 1), error);
  }
  return 1;
}

async function deleteShimsForTool(
  toolConfig: ToolConfig,
  targetDir: string,
  fs: IResolvedFileSystem,
  logger: TsLogger,
): Promise<void> {
  if (!toolConfig.binaries || toolConfig.binaries.length === 0) {
    return;
  }
  for (const binary of toolConfig.binaries) {
    const binaryName = typeof binary === "string" ? binary : binary.name;
    const shimPath = path.join(targetDir, binaryName);
    try {
      await fs.lstat(shimPath);
      await fs.rm(shimPath, { force: true });
      logger.debug(messages.shimDeleted(binaryName, shimPath));
    } catch {
      // Shim doesn't exist, nothing to delete
    }
  }
}

function isConfigurationOnlyToolConfig(toolConfig: ToolConfig): boolean {
  const isManual = toolConfig.installationMethod === "manual";
  const hasNoInstallParams = !toolConfig.installParams || Object.keys(toolConfig.installParams).length === 0;
  const hasNoBinaries = !toolConfig.binaries || toolConfig.binaries.length === 0;
  return isManual && hasNoInstallParams && hasNoBinaries;
}

function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }

  const message = typeof value === "string" ? value : "Unknown error";
  const error = new Error(message);
  return error;
}

async function executeInstallCommandAction(
  logger: TsLogger,
  nameOrBinary: string,
  combinedOptions: InstallCommandOptions,
  services: IServices,
): Promise<number | null> {
  const { projectConfig, fs, installer, configService, systemInfo } = services;

  logger.debug(
    messages.commandActionStarted("install", nameOrBinary),
    projectConfig.paths.toolConfigsDir,
    fs.constructor.name,
  );

  const loadResult = await loadToolConfigByNameOrBinary(
    logger,
    nameOrBinary,
    projectConfig.paths.toolConfigsDir,
    fs,
    projectConfig,
    configService,
    systemInfo,
  );

  if (!loadResult.success) {
    logger.error(messages.toolNotFoundByBinary(nameOrBinary, projectConfig.paths.toolConfigsDir));
    const result: number = 1;
    return result;
  }

  const { toolConfig, toolName } = loadResult;

  // Resolve platform-specific configuration before checking if it's configuration-only.
  // Tools like skhd may define installation only in platform-specific configs, so we need
  // to resolve the platform config first to determine if there are actual installation steps.
  const resolvedToolConfig = resolvePlatformConfig(toolConfig, systemInfo);

  if (isConfigurationOnlyToolConfig(resolvedToolConfig)) {
    const artifactsWereBroken = await reconcileToolArtifacts(logger, toolName, toolConfig, services);

    if (!combinedOptions.shimMode) {
      logger.info(messages.toolInstallSkippedConfigurationOnly(toolName));
      if (artifactsWereBroken) {
        logger.info(messages.toolArtifactsRepaired(toolName));
      }
    }

    const result: number | null = combinedOptions.shimMode ? 0 : null;
    return result;
  }

  const result = await installer.install(toolName, toolConfig, {
    force: combinedOptions.force,
    verbose: combinedOptions.verbose,
    shimMode: combinedOptions.shimMode,
  });

  let artifactsWereBroken = false;
  if (result.success) {
    const binaryPaths = "binaryPaths" in result ? result.binaryPaths : undefined;
    artifactsWereBroken = await reconcileToolArtifacts(logger, toolName, toolConfig, services, {
      version: result.version,
      binaryPaths,
    });
  }

  const exitCode = handleInstallationResult(logger, result, toolName, combinedOptions.shimMode, artifactsWereBroken);
  return exitCode;
}

export function registerInstallCommand(
  parentLogger: TsLogger,
  program: IGlobalProgram,
  servicesFactory: ServicesFactory,
): void {
  const logger = parentLogger.getSubLogger({ name: "registerInstallCommand" });
  program
    .command("install <nameOrBinary>")
    .description(
      "Installs a tool by name or binary. Accepts tool name (filename without .tool.ts) or binary name (from .bin()).",
    )
    .option("--force", "Force installation even if the tool is already installed", false)
    .option("--shim-mode", "Optimized output for shim usage: shows progress bars but suppresses log messages", false)
    .action(async (nameOrBinary: string, commandOptions: IInstallCommandSpecificOptions) => {
      const combinedOptions: InstallCommandOptions = {
        ...commandOptions,
        ...program.opts(),
      };
      const services = await servicesFactory();
      let shouldExitWithCode: number | null = null;

      try {
        shouldExitWithCode = await executeInstallCommandAction(logger, nameOrBinary, combinedOptions, services);
      } catch (error) {
        const finalError = toError(error);
        shouldExitWithCode = handleInstallationError(logger, finalError, nameOrBinary, combinedOptions.shimMode);
      }

      if (shouldExitWithCode !== null) {
        exitCli(shouldExitWithCode);
      }
    });
}
