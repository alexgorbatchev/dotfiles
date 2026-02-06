import type { ISerializableBinary, ISerializableToolConfig, IToolDetail } from '../../shared/types';

export interface SourceInfo {
  value: string;
  url?: string;
}

export function getBinaryName(binary: ISerializableBinary): string {
  return typeof binary === 'string' ? binary : binary.name;
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
    const deps = tool.config.dependencies ?? [];
    return deps.some((dep) => binarySet.has(dep));
  });
}

export function getSourceInfo(config: ISerializableToolConfig): SourceInfo | null {
  const { installationMethod, installParams } = config;

  switch (installationMethod) {
    case 'github-release':
      if (installParams.repo) {
        return {
          value: installParams.repo,
          url: `https://github.com/${installParams.repo}`,
        };
      }
      break;
    case 'cargo':
      if (installParams.crate) {
        return {
          value: installParams.crate,
          url: `https://crates.io/crates/${installParams.crate}`,
        };
      }
      break;
    case 'brew':
      if (installParams.formula) {
        return {
          value: installParams.formula,
          url: `https://formulae.brew.sh/formula/${installParams.formula}`,
        };
      }
      break;
    case 'zsh-plugin':
      if (installParams.repo) {
        return {
          value: installParams.repo,
          url: `https://github.com/${installParams.repo}`,
        };
      }
      break;
    case 'curl-script':
      if (installParams.url) {
        return {
          value: installParams.url,
          url: installParams.url,
        };
      }
      break;
    case 'curl-tar':
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
