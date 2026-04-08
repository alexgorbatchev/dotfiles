import type {
  SerializableBinary,
  ISerializableInstallParams,
  ISerializableToolConfig,
  IToolDetail,
} from "../../shared/types";

export interface ISourceInfo {
  value: string;
  url?: string;
}

interface IInstallConfigCandidate {
  installationMethod: string;
  installParams: ISerializableInstallParams;
}

function getInstallConfigCandidates(config: ISerializableToolConfig): IInstallConfigCandidate[] {
  const candidates: IInstallConfigCandidate[] = [
    {
      installationMethod: config.installationMethod,
      installParams: config.installParams,
    },
  ];

  for (const platformConfig of config.platformConfigs ?? []) {
    candidates.push({
      installationMethod: platformConfig.installationMethod ?? config.installationMethod,
      installParams: platformConfig.installParams ?? config.installParams,
    });
  }

  return candidates;
}

function getSourceInfoForInstallConfig(
  installationMethod: string,
  installParams: ISerializableInstallParams,
): ISourceInfo | null {
  switch (installationMethod) {
    case "github-release":
      if (installParams.repo) {
        return {
          value: installParams.repo,
          url: `https://github.com/${installParams.repo}`,
        };
      }
      break;
    case "cargo":
      if (installParams.crate) {
        return {
          value: installParams.crate,
          url: `https://crates.io/crates/${installParams.crate}`,
        };
      }
      break;
    case "brew":
      if (installParams.formula) {
        return {
          value: installParams.formula,
          url: `https://formulae.brew.sh/formula/${installParams.formula}`,
        };
      }
      break;
    case "zsh-plugin":
      if (installParams.repo) {
        return {
          value: installParams.repo,
          url: `https://github.com/${installParams.repo}`,
        };
      }
      break;
    case "curl-script":
    case "curl-tar":
      if (installParams.url) {
        return {
          value: installParams.url,
          url: installParams.url,
        };
      }
      break;
    default:
      return null;
  }

  return null;
}

export function getBinaryName(binary: SerializableBinary): string {
  return typeof binary === "string" ? binary : binary.name;
}

export function buildBinaryToToolMap(tools: IToolDetail[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const tool of tools) {
    const binaries = tool.config.binaries ?? [];
    for (const binary of binaries) {
      const name = getBinaryName(binary);
      map.set(name, tool.config.name);
    }
  }
  return map;
}

export function findDependentTools(tools: IToolDetail[], currentToolBinaries: string[]): IToolDetail[] {
  const binarySet = new Set(currentToolBinaries);
  return tools.filter((tool) => {
    const dependencies = tool.config.dependencies ?? [];
    return dependencies.some((dependency) => binarySet.has(dependency));
  });
}

export function getReadmeRepo(config: ISerializableToolConfig): string | null {
  if (config.installParams.repo) {
    return config.installParams.repo;
  }

  for (const platformConfig of config.platformConfigs ?? []) {
    if (platformConfig.installParams?.repo) {
      return platformConfig.installParams.repo;
    }
  }

  return null;
}

export function getSourceInfo(config: ISerializableToolConfig): ISourceInfo | null {
  for (const installConfig of getInstallConfigCandidates(config)) {
    const sourceInfo = getSourceInfoForInstallConfig(installConfig.installationMethod, installConfig.installParams);
    if (sourceInfo) {
      return sourceInfo;
    }
  }

  return null;
}
