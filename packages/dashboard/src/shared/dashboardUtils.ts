import type { ISystemInfo, ToolConfig } from "@dotfiles/core";
import { Architecture, Platform } from "@dotfiles/core";
import type { IFileState } from "@dotfiles/registry/file";
import type { IToolInstallationRecord } from "@dotfiles/registry/tool";

import type {
  ISerializableInstallParams,
  ISerializablePlatformConfigEntry,
  ISerializableToolConfig,
  IToolDetail,
  IToolRuntimeState,
  IToolUsageSummary,
} from "./types";

export function platformBitmaskToNames(platforms: Platform): string[] {
  const names: string[] = [];
  if (platforms & Platform.Linux) names.push("Linux");
  if (platforms & Platform.MacOS) names.push("macOS");
  if (platforms & Platform.Windows) names.push("Windows");
  return names;
}

export function architectureBitmaskToNames(architectures: Architecture): string[] {
  const names: string[] = [];
  if (architectures & Architecture.X86_64) names.push("x86_64");
  if (architectures & Architecture.Arm64) names.push("arm64");
  return names;
}

function extractInstallParams(params: Record<string, unknown>): ISerializableInstallParams {
  const installParams: ISerializableInstallParams = {};

  if (typeof params["repo"] === "string") installParams.repo = params["repo"];
  if (typeof params["assetPattern"] === "string") installParams.assetPattern = params["assetPattern"];
  if (typeof params["ghCli"] === "boolean") installParams.ghCli = params["ghCli"];
  if (typeof params["crate"] === "string") installParams.crate = params["crate"];
  if (typeof params["crateName"] === "string") installParams.crate = params["crateName"];
  if (typeof params["formula"] === "string") installParams.formula = params["formula"];
  if (typeof params["url"] === "string") installParams.url = params["url"];

  return installParams;
}

export function serializeToolConfig(config: ToolConfig): ISerializableToolConfig {
  const installParams: ISerializableInstallParams = {};

  if (config.installParams) {
    Object.assign(installParams, extractInstallParams(config.installParams));
  }

  let platformConfigs: ISerializablePlatformConfigEntry[] | undefined;
  if (config.platformConfigs && config.platformConfigs.length > 0) {
    platformConfigs = config.platformConfigs.map((entry) => {
      const serialized: ISerializablePlatformConfigEntry = {
        platforms: platformBitmaskToNames(entry.platforms),
      };

      if (entry.architectures !== undefined) {
        serialized.architectures = architectureBitmaskToNames(entry.architectures);
      }

      const platformConfig = entry.config;
      if (platformConfig.installationMethod) {
        serialized.installationMethod = platformConfig.installationMethod;
      }
      if (platformConfig.installParams) {
        serialized.installParams = extractInstallParams(platformConfig.installParams);
      }
      if (platformConfig.binaries) {
        serialized.binaries = platformConfig.binaries;
      }
      if (platformConfig.symlinks) {
        serialized.symlinks = platformConfig.symlinks;
      }

      return serialized;
    });
  }

  return {
    name: config.name,
    version: config.version,
    installationMethod: config.installationMethod,
    installParams,
    binaries: config.binaries,
    dependencies: config.dependencies,
    symlinks: config.symlinks,
    disabled: config.disabled,
    hostname: config.hostname,
    configFilePath: config.configFilePath,
    platformConfigs,
  };
}

export function getToolRuntimeState(
  toolName: string,
  installations: Map<string, IToolInstallationRecord>,
): IToolRuntimeState {
  const record = installations.get(toolName);

  if (!record) {
    return {
      status: "not-installed",
      installedVersion: null,
      installedAt: null,
      installPath: null,
      binaryPaths: [],
      hasUpdate: false,
    };
  }

  return {
    status: "installed",
    installedVersion: record.version,
    installedAt: record.installedAt.toISOString(),
    installPath: record.installPath,
    binaryPaths: record.binaryPaths || [],
    hasUpdate: false,
  };
}

export function toToolDetail(
  config: ToolConfig,
  installations: Map<string, IToolInstallationRecord>,
  files: IFileState[],
  _systemInfo: ISystemInfo,
  binaryDiskSize: number,
  usage: IToolUsageSummary,
): IToolDetail {
  return {
    config: serializeToolConfig(config),
    runtime: getToolRuntimeState(config.name, installations),
    files,
    binaryDiskSize,
    usage,
  };
}

export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) {
    return "just now";
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}
