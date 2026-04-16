import { loadConfig, type ProjectConfig } from "@dotfiles/config";
import {
  architectureFromNodeJS,
  libcFromString,
  Libc,
  Platform,
  type ISystemInfo,
  platformFromNodeJS,
} from "@dotfiles/core";
import type { IFileSystem } from "@dotfiles/file-system";
import type { TsLogger } from "@dotfiles/logger";
import { RegistryDatabase } from "@dotfiles/registry-database";
import { FileRegistry } from "@dotfiles/registry/file";
import { ToolInstallationRegistry } from "@dotfiles/registry/tool";
import os from "node:os";
import path from "node:path";
import { messages } from "../log-messages";
import { resolveConfigPath } from "../resolveConfigPath";
import { detectLibc } from "./detectLibc";

export interface IBaseRuntimeOptions {
  config: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  platform?: string;
  arch?: string;
  libc?: string;
  fileSystem: IFileSystem;
  configFileSystem?: IFileSystem;
  warnOnSystemInfoOverride?: boolean;
}

export interface IBaseRuntimeContext {
  projectConfig: ProjectConfig;
  systemInfo: ISystemInfo;
  registryPath: string;
  registryDatabase: RegistryDatabase;
  fileRegistry: FileRegistry;
  toolInstallationRegistry: ToolInstallationRegistry;
}

async function createSystemInfo(parentLogger: TsLogger, options: IBaseRuntimeOptions): Promise<ISystemInfo> {
  const platformString: NodeJS.Platform = (options.platform as NodeJS.Platform) || process.platform;
  const archString: NodeJS.Architecture = (options.arch as NodeJS.Architecture) || process.arch;
  const platform = platformFromNodeJS(platformString);
  const arch = architectureFromNodeJS(archString);

  if (options.warnOnSystemInfoOverride) {
    if (options.platform) {
      parentLogger.warn(messages.configParameterOverridden("platform", options.platform));
    }
    if (options.arch) {
      parentLogger.warn(messages.configParameterOverridden("arch", options.arch));
    }
    if (options.libc && platform === Platform.Linux) {
      parentLogger.warn(messages.configParameterOverridden("libc", options.libc));
    }
  }

  const libc =
    platform !== Platform.Linux
      ? Libc.Unknown
      : options.libc
        ? libcFromString(options.libc)
        : await detectLibc(platform, arch, {
            fileSystem: options.fileSystem,
            getProcessReport: () => process.report?.getReport?.(),
          });

  return {
    platform,
    arch,
    homeDir: os.homedir(),
    libc,
    hostname: os.hostname(),
  };
}

export async function createBaseRuntimeContext(
  parentLogger: TsLogger,
  options: IBaseRuntimeOptions,
): Promise<IBaseRuntimeContext | null> {
  const logger = parentLogger.getSubLogger({ name: "createBaseRuntimeContext" });
  const systemInfo = await createSystemInfo(parentLogger, options);

  const configPath = await resolveConfigPath(logger, options.config, {
    cwd: options.cwd,
    homeDir: systemInfo.homeDir,
  });

  if (!configPath) {
    return null;
  }

  const configFs = options.configFileSystem ?? options.fileSystem;
  const projectConfig = await loadConfig(logger, configFs, configPath, systemInfo, options.env);

  const finalSystemInfo: ISystemInfo = {
    ...systemInfo,
    homeDir: projectConfig.paths.homeDir,
  };

  const registryPath = path.join(projectConfig.paths.generatedDir, "registry.db");
  const registryDatabase = new RegistryDatabase(parentLogger, registryPath);
  const db = registryDatabase.getConnection();
  const registryLogger = parentLogger.getSubLogger({ context: "system" });
  const fileRegistry = new FileRegistry(registryLogger, db);
  const toolInstallationRegistry = new ToolInstallationRegistry(registryLogger, db);

  return {
    projectConfig,
    systemInfo: finalSystemInfo,
    registryPath,
    registryDatabase,
    fileRegistry,
    toolInstallationRegistry,
  };
}
