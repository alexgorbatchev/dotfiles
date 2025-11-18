import type { SystemInfo, ToolConfig } from '@dotfiles/core';
import type { TsLogger } from '@dotfiles/logger';
import { resolvePlatformConfig } from '@dotfiles/utils';
import { messages } from './log-messages';

interface ToolDependencyMetadata {
  providedBinaries: string[];
  dependencies: string[];
}

interface ToolMetadataResult {
  metadataByTool: Map<string, ToolDependencyMetadata>;
  binaryProviders: Map<string, Set<string>>;
  hasDependencies: boolean;
}

interface DependencyGraph {
  adjacency: Map<string, Set<string>>;
  inDegree: Map<string, number>;
}

function extractProvidedBinaries(toolName: string, toolConfig: ToolConfig): string[] {
  const providedBinaryNames = new Set<string>();

  if (toolConfig.binaries && toolConfig.binaries.length > 0) {
    for (const binary of toolConfig.binaries) {
      if (typeof binary === 'string') {
        providedBinaryNames.add(binary);
      } else {
        providedBinaryNames.add(binary.name);
      }
    }
  }

  if (providedBinaryNames.size === 0) {
    providedBinaryNames.add(toolName);
  }

  const binaryList: string[] = [...providedBinaryNames];
  return binaryList;
}

function extractDependencies(toolConfig: ToolConfig): string[] {
  if (!toolConfig.dependencies || toolConfig.dependencies.length === 0) {
    const emptyList: string[] = [];
    return emptyList;
  }

  const dependencyNames = new Set<string>();
  for (const dependencyName of toolConfig.dependencies) {
    const trimmedDependencyName = dependencyName.trim();
    if (trimmedDependencyName.length > 0) {
      dependencyNames.add(trimmedDependencyName);
    }
  }

  const dependencyList: string[] = [...dependencyNames];
  return dependencyList;
}

function insertOrdered(queue: string[], toolName: string, orderIndex: Map<string, number>): void {
  const targetIndex = orderIndex.get(toolName) ?? Number.MAX_SAFE_INTEGER;

  let insertPosition = queue.findIndex((queuedTool) => {
    const queuedIndex = orderIndex.get(queuedTool) ?? Number.MAX_SAFE_INTEGER;
    return queuedIndex > targetIndex;
  });

  if (insertPosition === -1) {
    insertPosition = queue.length;
  }

  queue.splice(insertPosition, 0, toolName);
}

function collectToolMetadata(toolConfigs: Record<string, ToolConfig>, systemInfo: SystemInfo): ToolMetadataResult {
  const metadataByTool: Map<string, ToolDependencyMetadata> = new Map();
  const binaryProviders: Map<string, Set<string>> = new Map();
  let hasDependencies = false;

  for (const [toolName, originalConfig] of Object.entries(toolConfigs)) {
    if (!originalConfig) {
      continue;
    }

    const resolvedConfig = resolvePlatformConfig(originalConfig, systemInfo);
    const providedBinaries = extractProvidedBinaries(toolName, resolvedConfig);
    const dependencies = extractDependencies(resolvedConfig);

    const metadata: ToolDependencyMetadata = {
      providedBinaries,
      dependencies,
    };
    metadataByTool.set(toolName, metadata);

    if (dependencies.length > 0) {
      hasDependencies = true;
    }

    for (const binaryName of providedBinaries) {
      const providers = binaryProviders.get(binaryName);
      if (providers) {
        providers.add(toolName);
      } else {
        const providerSet: Set<string> = new Set([toolName]);
        binaryProviders.set(binaryName, providerSet);
      }
    }
  }

  const result: ToolMetadataResult = {
    metadataByTool,
    binaryProviders,
    hasDependencies,
  };
  return result;
}

function resolveDependencyProvider(
  toolName: string,
  dependencyName: string,
  binaryProviders: Map<string, Set<string>>,
  systemInfo: SystemInfo
): string {
  const providers = binaryProviders.get(dependencyName);
  if (!providers || providers.size === 0) {
    throw new Error(
      `Missing dependency: tool "${toolName}" requires binary "${dependencyName}" but no tool provides it for platform ${systemInfo.platform}/${systemInfo.arch}.`
    );
  }

  if (providers.size > 1) {
    const providerList: string[] = [...providers];
    throw new Error(
      `Ambiguous dependency: binary "${dependencyName}" is provided by multiple tools (${providerList.join(
        ', '
      )}). Tool "${toolName}" cannot determine which to use.`
    );
  }

  const [providerToolName] = providers;
  if (!providerToolName) {
    throw new Error(
      `Missing dependency: tool "${toolName}" requires binary "${dependencyName}" but provider resolution failed unexpectedly.`
    );
  }

  return providerToolName;
}

function buildDependencyGraph(
  toolNames: string[],
  metadataByTool: Map<string, ToolDependencyMetadata>,
  binaryProviders: Map<string, Set<string>>,
  systemInfo: SystemInfo
): DependencyGraph {
  const adjacency: Map<string, Set<string>> = new Map();
  const inDegree: Map<string, number> = new Map();

  for (const toolName of toolNames) {
    adjacency.set(toolName, new Set());
    inDegree.set(toolName, 0);
  }

  for (const toolName of toolNames) {
    const metadata = metadataByTool.get(toolName);
    if (!metadata) {
      continue;
    }

    for (const dependencyName of metadata.dependencies) {
      const providerToolName = resolveDependencyProvider(toolName, dependencyName, binaryProviders, systemInfo);

      if (providerToolName === toolName) {
        continue;
      }

      const dependents = adjacency.get(providerToolName);
      if (dependents) {
        dependents.add(toolName);
      }

      const currentDegree = inDegree.get(toolName) ?? 0;
      inDegree.set(toolName, currentDegree + 1);
    }
  }

  const graph: DependencyGraph = {
    adjacency,
    inDegree,
  };
  return graph;
}

function performTopologicalSort(
  toolNames: string[],
  graph: DependencyGraph,
  toolOrderIndex: Map<string, number>
): string[] {
  const zeroInDegreeQueue: string[] = [];

  for (const toolName of toolNames) {
    if ((graph.inDegree.get(toolName) ?? 0) === 0) {
      insertOrdered(zeroInDegreeQueue, toolName, toolOrderIndex);
    }
  }

  const orderedToolNames: string[] = [];

  while (zeroInDegreeQueue.length > 0) {
    const currentTool = zeroInDegreeQueue.shift();
    if (!currentTool) {
      continue;
    }

    orderedToolNames.push(currentTool);
    const dependents = graph.adjacency.get(currentTool);
    if (!dependents) {
      continue;
    }

    for (const dependentTool of dependents) {
      const reducedDegree = (graph.inDegree.get(dependentTool) ?? 0) - 1;
      graph.inDegree.set(dependentTool, reducedDegree);

      if (reducedDegree === 0) {
        insertOrdered(zeroInDegreeQueue, dependentTool, toolOrderIndex);
      }
    }
  }

  return orderedToolNames;
}

export function orderToolConfigsByDependencies(
  parentLogger: TsLogger,
  toolConfigs: Record<string, ToolConfig>,
  systemInfo: SystemInfo
): Record<string, ToolConfig> {
  const logger = parentLogger.getSubLogger({ name: 'orderToolConfigsByDependencies' });

  const toolNames: string[] = Object.keys(toolConfigs);
  logger.debug(messages.generateAll.dependenciesValidationStarted(toolNames.length));

  if (toolNames.length === 0) {
    return toolConfigs;
  }

  const toolOrderIndex = new Map<string, number>();
  toolNames.forEach((toolName, index) => {
    toolOrderIndex.set(toolName, index);
  });

  const { metadataByTool, binaryProviders, hasDependencies } = collectToolMetadata(toolConfigs, systemInfo);

  if (!hasDependencies) {
    return toolConfigs;
  }
  const dependencyGraph = buildDependencyGraph(toolNames, metadataByTool, binaryProviders, systemInfo);

  const orderedToolNames = performTopologicalSort(toolNames, dependencyGraph, toolOrderIndex);
  if (orderedToolNames.length !== toolNames.length) {
    const remainingTools = toolNames.filter((toolName) => (dependencyGraph.inDegree.get(toolName) ?? 0) > 0);
    throw new Error(`Circular dependency detected between tools: ${remainingTools.join(', ')}`);
  }

  logger.debug(messages.generateAll.dependenciesOrderResolved(orderedToolNames.join(' -> ')));

  const orderedToolConfigs: Record<string, ToolConfig> = {};
  for (const toolName of orderedToolNames) {
    const originalConfig = toolConfigs[toolName];
    if (!originalConfig) {
      throw new Error(`Tool configuration missing for "${toolName}" after dependency ordering.`);
    }
    orderedToolConfigs[toolName] = originalConfig;
  }

  return orderedToolConfigs;
}
