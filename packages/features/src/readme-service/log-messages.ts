import { createSafeLogMessage } from "@dotfiles/logger";

export const messages = {
  fetchingReadme: (owner: string, repo: string, version: string) =>
    createSafeLogMessage(`Fetching README for ${owner}/${repo}@${version}`),

  readmeFetched: (owner: string, repo: string, version: string, contentLength: number) =>
    createSafeLogMessage(`README fetched for ${owner}/${repo}@${version} (${contentLength} characters)`),

  readmeNotFound: (owner: string, repo: string, version: string, url: string) =>
    createSafeLogMessage(`README not found for ${owner}/${repo}@${version} at ${url}`),

  readmeCacheHit: (owner: string, repo: string, version: string) =>
    createSafeLogMessage(`README cache hit for ${owner}/${repo}@${version}`),

  readmeCacheMiss: (owner: string, repo: string, version: string) =>
    createSafeLogMessage(`README cache miss for ${owner}/${repo}@${version}`),

  readmeCached: (owner: string, repo: string, version: string, ttl: number) =>
    createSafeLogMessage(`README cached for ${owner}/${repo}@${version} with TTL ${ttl}ms`),

  generatingCombinedReadme: (toolCount: number) =>
    createSafeLogMessage(`Generating combined README for ${toolCount} tools`),

  combinedReadmeGenerated: (toolCount: number, contentLength: number) =>
    createSafeLogMessage(`Combined README generated for ${toolCount} tools (${contentLength} characters)`),

  fetchingInstalledTools: () => createSafeLogMessage("Fetching installed GitHub tools from registry"),

  installedToolsFound: (count: number) => createSafeLogMessage(`Found ${count} GitHub tools in registry`),

  githubToolsExtracted: (count: number) => createSafeLogMessage(`Extracted ${count} GitHub tools from configurations`),

  clearingExpiredCache: () => createSafeLogMessage("Clearing expired README cache entries"),

  cacheCleared: (count: number) => createSafeLogMessage(`Cleared ${count} expired README cache entries`),

  fetchError: (owner: string, repo: string, version: string, error: string) =>
    createSafeLogMessage(`Error fetching README for ${owner}/${repo}@${version}: ${error}`),

  cacheError: (operation: string, cacheKey: string, error: string) =>
    createSafeLogMessage(`Cache ${operation} error for ${cacheKey}: ${error}`),

  urlConstruction: (url: string) => createSafeLogMessage(`Constructed README URL: ${url}`),

  serviceInitialized: () => createSafeLogMessage("README service initialized"),

  serviceDestroyed: () => createSafeLogMessage("README service destroyed"),

  writingReadmeToPath: (toolName: string, version: string, filePath: string) =>
    createSafeLogMessage(`Writing README for ${toolName}@${version} to ${filePath}`),

  readmeWritten: (toolName: string, version: string, filePath: string, contentLength: number) =>
    createSafeLogMessage(`README written for ${toolName}@${version} to ${filePath} (${contentLength} characters)`),

  readmeWriteError: (toolName: string, version: string, filePath: string, error: string) =>
    createSafeLogMessage(`Error writing README for ${toolName}@${version} to ${filePath}: ${error}`),

  readmeNotAvailableForWrite: (toolName: string, version: string) =>
    createSafeLogMessage(`README not available for ${toolName}@${version}, skipping write`),

  catalogGeneration: {
    started: (catalogPath: string) => createSafeLogMessage(`Starting catalog generation at ${catalogPath}`),

    completed: (catalogPath: string, contentLength: number) =>
      createSafeLogMessage(`Catalog generated at ${catalogPath} (${contentLength} characters)`),

    failed: (catalogPath: string, error: string) =>
      createSafeLogMessage(`Failed to generate catalog at ${catalogPath}: ${error}`),

    noGitHubTools: () =>
      createSafeLogMessage(
        "No GitHub tools installed. Run the generate command to install tools before generating a catalog.",
      ),
  },
};
