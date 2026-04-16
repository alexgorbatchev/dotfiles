#!/usr/bin/env bun

import { ArchiveExtractor } from "@dotfiles/archive-extractor";
import { ConfigService, type ProjectConfig } from "@dotfiles/config";
import { createShell, InstallerPluginRegistry } from "@dotfiles/core";
import { Downloader, FileCache, type ICache } from "@dotfiles/downloader";
import { ReadmeService } from "@dotfiles/features";
import {
  type IFileSystem,
  type IResolvedFileSystem,
  MemFileSystem,
  NodeFileSystem,
  ResolvedFileSystem,
} from "@dotfiles/file-system";
import { GeneratorOrchestrator } from "@dotfiles/generator-orchestrator";
import { HookExecutor, Installer } from "@dotfiles/installer";
import { BrewInstallerPlugin } from "@dotfiles/installer-brew";
import { CargoClient, CargoInstallerPlugin } from "@dotfiles/installer-cargo";
import { CurlBinaryInstallerPlugin } from "@dotfiles/installer-curl-binary";
import { CurlScriptInstallerPlugin } from "@dotfiles/installer-curl-script";
import { CurlTarInstallerPlugin } from "@dotfiles/installer-curl-tar";
import { DmgInstallerPlugin } from "@dotfiles/installer-dmg";
import { GiteaReleaseInstallerPlugin } from "@dotfiles/installer-gitea";
import { GhCliApiClient, GitHubApiClient, GitHubReleaseInstallerPlugin } from "@dotfiles/installer-github";
import { ManualInstallerPlugin } from "@dotfiles/installer-manual";
import { NpmInstallerPlugin } from "@dotfiles/installer-npm";
import { ZshPluginInstallerPlugin } from "@dotfiles/installer-zsh-plugin";
import { createTsLogger, getLogLevelFromFlags, type LogLevelValue, type TsLogger } from "@dotfiles/logger";
import { type IFileRegistry, TrackedFileSystem } from "@dotfiles/registry/file";
import { CompletionCommandExecutor, CompletionGenerator, ShellInitGenerator } from "@dotfiles/shell-init-generator";
import { ShimGenerator } from "@dotfiles/shim-generator";
import { CopyGenerator, SymlinkGenerator } from "@dotfiles/symlink-generator";
import { VersionChecker } from "@dotfiles/version-checker";
import net from "node:net";
import path from "node:path";

import { registerBinCommand } from "./binCommand";
import { registerCheckUpdatesCommand } from "./checkUpdatesCommand";
import { registerCleanupCommand } from "./cleanupCommand";
import { createProgram } from "./createProgram";
import { registerDashboardCommand } from "./dashboardCommand";
import { registerDetectConflictsCommand } from "./detectConflictsCommand";
import { registerEnvCommand } from "./envCommand";
import { registerFeaturesCommand } from "./featuresCommand";
import { registerFilesCommand } from "./filesCommand";
import { registerGenerateCommand } from "./generateCommand";
import { registerInstallCommand } from "./installCommand";
import { messages } from "./log-messages";
import { registerLogCommand } from "./logCommand";
import { populateMemFsForDryRun } from "./populateMemFsForDryRun";
import { createBaseRuntimeContext } from "./runtime/createBaseRuntimeContext";
import { registerSkillCommand } from "./skillCommand";
import type { IGlobalProgram, IGlobalProgramOptions, IServices, ServicesFactory } from "./types";
import { registerUpdateCommand } from "./updateCommand";

// Re-export public API for library consumers
export * from "./schema-exports";

type SetupServicesOptions = IGlobalProgramOptions & {
  cwd: string;
  env: NodeJS.ProcessEnv;
};

/**
 * Checks if a TCP port is available by attempting to connect.
 * Returns true if connection succeeds, false otherwise.
 */
async function isProxyAvailable(port: number, timeoutMs: number = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();

    const cleanup = (): void => {
      socket.removeAllListeners();
      socket.destroy();
    };

    socket.setTimeout(timeoutMs);

    socket.on("connect", () => {
      cleanup();
      resolve(true);
    });

    socket.on("timeout", () => {
      cleanup();
      resolve(false);
    });

    socket.on("error", () => {
      cleanup();
      resolve(false);
    });

    socket.connect(port, "localhost");
  });
}

interface IDevProxyValidationResult {
  port: number | undefined;
  invalidValue: string | undefined;
}

function validateDevProxyPort(rawValue: string | undefined): IDevProxyValidationResult {
  if (typeof rawValue === "undefined") {
    return {
      port: undefined,
      invalidValue: undefined,
    };
  }

  const normalizedValue = rawValue.trim();
  const isIntegerString = /^\d+$/.test(normalizedValue);

  if (!isIntegerString) {
    return {
      port: undefined,
      invalidValue: rawValue,
    };
  }

  const parsedPort = Number.parseInt(normalizedValue, 10);
  const isValidPortRange = parsedPort >= 1 && parsedPort <= 65535;

  if (!isValidPortRange) {
    return {
      port: undefined,
      invalidValue: rawValue,
    };
  }

  return {
    port: parsedPort,
    invalidValue: undefined,
  };
}

function initializeFileSystem(logger: TsLogger, dryRun: boolean): IFileSystem {
  let fs: IFileSystem;
  if (dryRun) {
    logger.trace(messages.dryRunEnabled());
    fs = new MemFileSystem({});
  } else {
    fs = new NodeFileSystem();
  }
  logger.trace(messages.componentInitialized("filesystem"), fs.constructor.name);
  return fs;
}

function initializeDownloadCache(
  parentLogger: TsLogger,
  fs: IFileSystem,
  projectConfig: ProjectConfig,
): ICache | undefined {
  if (!projectConfig.downloader.cache.enabled) {
    parentLogger.info(messages.cachingDisabled());
    return undefined;
  }

  const cacheDir = path.join(projectConfig.paths.generatedDir, "cache", "downloads");
  const downloadCache = new FileCache(parentLogger, fs, {
    enabled: true,
    defaultTtl: projectConfig.downloader.cache.ttl,
    cacheDir,
    storageStrategy: "binary",
  });

  return downloadCache;
}

interface ITrackedFileSystems {
  shimTrackedFs: TrackedFileSystem;
  shellInitTrackedFs: TrackedFileSystem;
  symlinkTrackedFs: TrackedFileSystem;
  copyTrackedFs: TrackedFileSystem;
  installerTrackedFs: TrackedFileSystem;
  catalogTrackedFs: TrackedFileSystem;
  completionTrackedFs: TrackedFileSystem;
}

function createTrackedFileSystems(
  parentLogger: TsLogger,
  fs: IResolvedFileSystem,
  fileRegistry: IFileRegistry,
  projectConfig: ProjectConfig,
): ITrackedFileSystems {
  const shimTrackedFs = new TrackedFileSystem(
    parentLogger,
    fs,
    fileRegistry,
    TrackedFileSystem.createContext("system", "shim"),
    projectConfig,
  );

  const shellInitTrackedFs = new TrackedFileSystem(
    parentLogger,
    fs,
    fileRegistry,
    TrackedFileSystem.createContext("system", "init"),
    projectConfig,
  );

  const symlinkTrackedFs = new TrackedFileSystem(
    parentLogger,
    fs,
    fileRegistry,
    TrackedFileSystem.createContext("system", "symlink"),
    projectConfig,
  );

  const copyTrackedFs = new TrackedFileSystem(
    parentLogger,
    fs,
    fileRegistry,
    TrackedFileSystem.createContext("system", "copy"),
    projectConfig,
  );

  const installerTrackedFs = new TrackedFileSystem(
    parentLogger,
    fs,
    fileRegistry,
    TrackedFileSystem.createContext("system", "binary"),
    projectConfig,
  );

  const catalogTrackedFs = new TrackedFileSystem(
    parentLogger,
    fs,
    fileRegistry,
    TrackedFileSystem.createContext("system", "catalog"),
    projectConfig,
  );

  const completionTrackedFs = new TrackedFileSystem(
    parentLogger,
    fs,
    fileRegistry,
    TrackedFileSystem.createContext("system", "completion"),
    projectConfig,
  );

  return {
    shimTrackedFs,
    shellInitTrackedFs,
    symlinkTrackedFs,
    copyTrackedFs,
    installerTrackedFs,
    catalogTrackedFs,
    completionTrackedFs,
  };
}

export async function setupServices(parentLogger: TsLogger, options: SetupServicesOptions): Promise<IServices> {
  const logger = parentLogger.getSubLogger({ name: "setupServices" });
  const { dryRun, env, config } = options;

  // Initialize filesystem first
  const fs = initializeFileSystem(logger, dryRun);

  // For config loading, use NodeFileSystem only in dry-run mode when running the CLI directly
  const isRunningDirectly = process.env.NODE_ENV !== "test" && !process.env["BUN_TEST"];
  const configFs = dryRun && isRunningDirectly ? new NodeFileSystem() : fs;

  const baseContext = await createBaseRuntimeContext(logger, {
    config,
    cwd: options.cwd,
    env,
    platform: options.platform,
    arch: options.arch,
    libc: options.libc,
    fileSystem: fs,
    configFileSystem: configFs,
    warnOnSystemInfoOverride: true,
  });

  if (!baseContext) {
    logger.error(messages.configNotFound());
    process.exit(1);
  }

  const { projectConfig, systemInfo, registryPath, fileRegistry, toolInstallationRegistry } = baseContext;

  const devProxyRawValue = env["DEV_PROXY"];
  const devProxyValidation = validateDevProxyPort(devProxyRawValue);
  const devProxyPort = devProxyValidation.port;

  if (typeof devProxyValidation.invalidValue === "string") {
    logger.error(
      messages.configParameterInvalid("DEV_PROXY", devProxyValidation.invalidValue, "an integer between 1 and 65535"),
    );
    process.exit(1);
  }

  if (typeof devProxyPort === "number") {
    logger.debug(messages.proxyCheckingAvailability(devProxyPort));
    const proxyAvailable = await isProxyAvailable(devProxyPort);
    if (!proxyAvailable) {
      logger.error(messages.proxyUnavailable(devProxyPort));
      process.exit(1);
    }
    logger.warn(messages.proxyEnabled(devProxyPort));
  }

  // Wrap filesystem to resolve tilde paths using configured home
  const resolvedFs = new ResolvedFileSystem(fs, projectConfig.paths.homeDir);

  // If dry run, load tool configs into memory filesystem
  if (dryRun) {
    const nodeFs = new NodeFileSystem();
    await populateMemFsForDryRun(logger, {
      sourceFs: nodeFs,
      targetFs: resolvedFs,
      toolConfigsDir: projectConfig.paths.toolConfigsDir,
      homeDir: systemInfo.homeDir,
    });
  }

  // Initialize download cache if enabled
  const downloadCache = initializeDownloadCache(parentLogger, resolvedFs, projectConfig);

  parentLogger.debug(messages.registryInitialized(registryPath));

  // Initialize services with projectConfig
  // Pass proxy config to enable routing requests through HTTP caching proxy
  const proxyConfig = typeof devProxyPort === "number" ? { enabled: true, port: devProxyPort } : undefined;
  const downloader = new Downloader(parentLogger, resolvedFs, undefined, downloadCache, proxyConfig);

  // Create shell instance for all components
  const shell = createShell();

  // Initialize GitHub API cache using generic FileCache with JSON strategy
  const githubApiCache = new FileCache(parentLogger, resolvedFs, {
    enabled: projectConfig.github.cache.enabled,
    defaultTtl: projectConfig.github.cache.ttl,
    cacheDir: path.join(projectConfig.paths.generatedDir, "cache", "github-api"),
    storageStrategy: "json",
  });
  const githubApiClient = new GitHubApiClient(parentLogger, projectConfig, downloader, githubApiCache);
  const ghCliApiClient = new GhCliApiClient(parentLogger, projectConfig, shell, githubApiCache);

  const giteaApiCache = new FileCache(parentLogger, resolvedFs, {
    enabled: projectConfig.github.cache.enabled,
    defaultTtl: projectConfig.github.cache.ttl,
    cacheDir: path.join(projectConfig.paths.generatedDir, "cache", "gitea-api"),
    storageStrategy: "json",
  });

  const cargoCratesIoCache = new FileCache(parentLogger, resolvedFs, {
    enabled: projectConfig.cargo.cratesIo.cache.enabled,
    defaultTtl: projectConfig.cargo.cratesIo.cache.ttl,
    cacheDir: path.join(projectConfig.paths.generatedDir, "cache", "cargo", "crates-io"),
    storageStrategy: "json",
  });
  const cargoGithubRawCache = new FileCache(parentLogger, resolvedFs, {
    enabled: projectConfig.cargo.githubRaw.cache.enabled,
    defaultTtl: projectConfig.cargo.githubRaw.cache.ttl,
    cacheDir: path.join(projectConfig.paths.generatedDir, "cache", "cargo", "github-raw"),
    storageStrategy: "json",
  });
  const cargoClient = new CargoClient(parentLogger, projectConfig, downloader, cargoCratesIoCache, cargoGithubRawCache);

  // Create tracked filesystem instances for each generator
  const {
    shimTrackedFs,
    shellInitTrackedFs,
    symlinkTrackedFs,
    copyTrackedFs,
    installerTrackedFs,
    catalogTrackedFs,
    completionTrackedFs,
  } = createTrackedFileSystems(parentLogger, resolvedFs, fileRegistry, projectConfig);

  // Create system-context logger for generators that operate at system level
  const systemLogger = parentLogger.getSubLogger({ context: "system" });

  const shellInitGenerator = new ShellInitGenerator(systemLogger, shellInitTrackedFs, projectConfig);
  const symlinkGenerator = new SymlinkGenerator(systemLogger, symlinkTrackedFs, projectConfig, systemInfo);
  const copyGenerator = new CopyGenerator(systemLogger, copyTrackedFs, projectConfig, systemInfo);
  const completionCommandExecutor = new CompletionCommandExecutor(systemLogger, shell);

  const archiveExtractor = new ArchiveExtractor(parentLogger, resolvedFs, shell);

  // Initialize hook executor for plugins
  const hookExecutor = new HookExecutor((chunk: string): void => {
    process.stdout.write(chunk);
  });

  // Initialize plugin registry and register all installer plugins
  const pluginRegistry = new InstallerPluginRegistry(parentLogger);
  pluginRegistry.register(
    new GitHubReleaseInstallerPlugin(
      installerTrackedFs,
      downloader,
      githubApiClient,
      ghCliApiClient,
      archiveExtractor,
      projectConfig,
      hookExecutor,
    ),
  );
  pluginRegistry.register(
    new GiteaReleaseInstallerPlugin(installerTrackedFs, downloader, archiveExtractor, hookExecutor, giteaApiCache),
  );
  pluginRegistry.register(new BrewInstallerPlugin(shell));
  pluginRegistry.register(
    new CargoInstallerPlugin(
      installerTrackedFs,
      downloader,
      cargoClient,
      archiveExtractor,
      hookExecutor,
      projectConfig.cargo.githubRelease.host,
    ),
  );
  pluginRegistry.register(new CurlScriptInstallerPlugin(installerTrackedFs, downloader, hookExecutor, shell));
  pluginRegistry.register(
    new CurlTarInstallerPlugin(installerTrackedFs, downloader, archiveExtractor, hookExecutor, shell),
  );
  pluginRegistry.register(new CurlBinaryInstallerPlugin(installerTrackedFs, downloader, hookExecutor, shell));
  pluginRegistry.register(
    new DmgInstallerPlugin(
      installerTrackedFs,
      downloader,
      archiveExtractor,
      hookExecutor,
      shell,
      githubApiClient,
      ghCliApiClient,
    ),
  );
  pluginRegistry.register(new ManualInstallerPlugin(installerTrackedFs));
  pluginRegistry.register(new NpmInstallerPlugin(shell));
  pluginRegistry.register(new ZshPluginInstallerPlugin(installerTrackedFs, shell));

  // Create shim generator with knowledge of externally managed plugins (e.g., brew)
  // so it can skip shim generation for already-installed externally managed tools
  const externallyManagedMethods = pluginRegistry.getExternallyManagedMethods();
  const missingBinaryMessagesByMethod = pluginRegistry.getMissingBinaryMessagesByMethod();
  const shimGenerator = new ShimGenerator(
    systemLogger,
    shimTrackedFs,
    projectConfig,
    systemInfo,
    externallyManagedMethods,
    missingBinaryMessagesByMethod,
    toolInstallationRegistry,
  );

  const completionGenerator = new CompletionGenerator(
    systemLogger,
    completionTrackedFs,
    shell,
    completionCommandExecutor,
    {
      downloader,
      archiveExtractor,
    },
  );

  const generatorOrchestrator = new GeneratorOrchestrator(
    systemLogger,
    shimGenerator,
    shellInitGenerator,
    symlinkGenerator,
    copyGenerator,
    completionGenerator,
    systemInfo,
    projectConfig,
    fileRegistry,
    resolvedFs,
    completionTrackedFs,
  );

  const installer = new Installer(
    logger,
    installerTrackedFs,
    resolvedFs,
    projectConfig,
    toolInstallationRegistry,
    systemInfo,
    pluginRegistry,
    symlinkGenerator,
    shell, // Don't add logging here - HookExecutor.createEnhancedContext adds logging with tool context
    hookExecutor,
    completionGenerator,
  );
  const versionChecker = new VersionChecker(logger, githubApiClient);
  const configService = new ConfigService();
  const readmeService = new ReadmeService(
    logger,
    downloader,
    toolInstallationRegistry,
    resolvedFs,
    catalogTrackedFs,
    path.join(projectConfig.paths.generatedDir, "cache", "readme"),
    pluginRegistry,
  );

  return {
    projectConfig,
    fs: resolvedFs,
    configService,
    readmeService,
    fileRegistry,
    toolInstallationRegistry,
    downloadCache,
    downloader,
    githubApiCache,
    cargoCratesIoCache,
    cargoGithubRawCache,
    githubApiClient,
    cargoClient,
    shimGenerator,
    shellInitGenerator,
    symlinkGenerator,
    copyGenerator,
    completionGenerator,
    generatorOrchestrator,
    installer,
    archiveExtractor,
    versionChecker,
    pluginRegistry,
    systemInfo,
  };
}

export function registerAllCommands(parentLogger: TsLogger, program: IGlobalProgram, servicesFactory: ServicesFactory) {
  const logger = parentLogger.getSubLogger({ name: "registerAllCommands" });
  registerBinCommand(logger, program, servicesFactory);
  registerInstallCommand(logger, program, servicesFactory);
  registerGenerateCommand(logger, program, servicesFactory);
  registerFeaturesCommand(logger, program, servicesFactory);
  registerCleanupCommand(logger, program, servicesFactory);
  registerCheckUpdatesCommand(logger, program, servicesFactory);
  registerUpdateCommand(logger, program, servicesFactory);
  registerDetectConflictsCommand(logger, program, servicesFactory);
  registerLogCommand(logger, program, servicesFactory);
  registerFilesCommand(logger, program, servicesFactory);
  registerSkillCommand(logger, program, servicesFactory);
  registerDashboardCommand(logger, program, servicesFactory);
  registerEnvCommand(logger, program);
}

function hasFlag(argv: string[], flag: string): boolean {
  return argv.includes(flag);
}

export function resolveLogLevel(argv: string[], options: IGlobalProgramOptions): LogLevelValue {
  const isShimMode = hasFlag(argv, "--shim-mode");
  const quiet = options.quiet || isShimMode;
  return getLogLevelFromFlags(options.log, quiet, options.verbose);
}

export async function main(argv: string[]) {
  const program = createProgram();

  // Parse options first to get quiet/verbose flags
  program.parseOptions(argv);
  const options: IGlobalProgramOptions = program.opts();

  // Create logger with appropriate level based on CLI flags
  const logLevel = resolveLogLevel(argv, options);
  const rootLogger = createTsLogger({ name: "cli", level: logLevel, trace: options.trace });
  const logger = rootLogger.getSubLogger({ name: "main" });

  logger.trace(messages.cliStarted(), argv);

  // Create a factory function that will initialize services only when needed
  const servicesFactory = async () => {
    return await setupServices(logger, {
      ...options,
      cwd: process.cwd(),
      env: process.env,
    });
  };

  registerAllCommands(logger, program, servicesFactory);
  await program.parseAsync(argv);
}

export async function runCliEntrypoint(argv: string[]): Promise<void> {
  await main(argv);
}

// Only run main if the script is executed directly
if (import.meta.main) {
  runCliEntrypoint(process.argv).catch((error) => {
    // Create a basic logger for fatal errors only, since we don't have parsed options yet
    const fatalLogger = createTsLogger({ name: "cli" });
    fatalLogger.fatal(messages.commandExecutionFailed("main", 1), error);
    process.exit(1);
  });
}
