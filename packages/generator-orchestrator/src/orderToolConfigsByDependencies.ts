import type { ISystemInfo, ToolConfig } from '@dotfiles/core';
import type { TsLogger } from '@dotfiles/logger';
import { resolvePlatformConfig } from '@dotfiles/utils';
import { messages } from './log-messages';

interface IToolDependencyMetadata {
  providedBinaries: string[];
  dependencies: string[];
}

interface IToolMetadataResult {
  metadataByTool: Map<string, IToolDependencyMetadata>;
  binaryProviders: Map<string, Set<string>>;
  hasDependencies: boolean;
}

interface IDependencyGraph {
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

function collectToolMetadata(toolConfigs: Record<string, ToolConfig>, systemInfo: ISystemInfo): IToolMetadataResult {
  const metadataByTool: Map<string, IToolDependencyMetadata> = new Map();
  const binaryProviders: Map<string, Set<string>> = new Map();
  let hasDependencies = false;

  for (const [toolName, originalConfig] of Object.entries(toolConfigs)) {
    if (!originalConfig) {
      continue;
    }

    const resolvedConfig = resolvePlatformConfig(originalConfig, systemInfo);
    const providedBinaries = extractProvidedBinaries(toolName, resolvedConfig);
    const dependencies = extractDependencies(resolvedConfig);

    const metadata: IToolDependencyMetadata = {
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

  const result: IToolMetadataResult = {
    metadataByTool,
    binaryProviders,
    hasDependencies,
  };
  return result;
}

function resolveDependencyProvider(
  logger: TsLogger,
  toolName: string,
  dependencyName: string,
  binaryProviders: Map<string, Set<string>>,
  systemInfo: ISystemInfo
): string {
  const providers = binaryProviders.get(dependencyName);
  if (!providers || providers.size === 0) {
    logger.error(
      messages.generateAll.missingDependency(toolName, dependencyName, systemInfo.platform, systemInfo.arch)
    );
    throw new Error('Dependency validation failed');
  }

  if (providers.size > 1) {
    const providerList: string[] = [...providers];
    logger.error(messages.generateAll.ambiguousDependency(dependencyName, providerList.join(', '), toolName));
    throw new Error('Dependency validation failed');
  }

  const [providerToolName] = providers;
  if (!providerToolName) {
    logger.error(
      messages.generateAll.missingDependency(toolName, dependencyName, systemInfo.platform, systemInfo.arch)
    );
    throw new Error('Dependency validation failed');
  }

  return providerToolName;
}

function buildDependencyGraph(
  logger: TsLogger,
  toolNames: string[],
  metadataByTool: Map<string, IToolDependencyMetadata>,
  binaryProviders: Map<string, Set<string>>,
  systemInfo: ISystemInfo
): IDependencyGraph {
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
      const providerToolName = resolveDependencyProvider(logger, toolName, dependencyName, binaryProviders, systemInfo);

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

  const graph: IDependencyGraph = {
    adjacency,
    inDegree,
  };
  return graph;
}

function performTopologicalSort(
  toolNames: string[],
  graph: IDependencyGraph,
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
  systemInfo: ISystemInfo
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
  const dependencyGraph = buildDependencyGraph(logger, toolNames, metadataByTool, binaryProviders, systemInfo);

  const orderedToolNames = performTopologicalSort(toolNames, dependencyGraph, toolOrderIndex);
  if (orderedToolNames.length !== toolNames.length) {
    const remainingTools = toolNames.filter((toolName) => (dependencyGraph.inDegree.get(toolName) ?? 0) > 0);
    logger.error(messages.generateAll.circularDependency(remainingTools.join(', ')));
    throw new Error('Dependency validation failed');
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
