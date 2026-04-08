import type { InstallerPluginRegistry, ToolConfig } from "@dotfiles/core";
import type { IDownloader } from "@dotfiles/downloader";
import { FileCache } from "@dotfiles/downloader";
import type { IFileSystem } from "@dotfiles/file-system";
import type { TsLogger } from "@dotfiles/logger";
import type { IToolInstallationRecord, IToolInstallationRegistry } from "@dotfiles/registry";
import type { TrackedFileSystem } from "@dotfiles/registry/file";
import path from "node:path";
import { DEFAULT_README_CACHE_TTL, GITHUB_RAW_BASE_URL, README_FILENAME } from "./constants";
import type { IReadmeService } from "./IReadmeService";
import { messages } from "./log-messages";
import { ReadmeCache } from "./ReadmeCache";
import type { ICombinedReadmeOptions, IReadmeContent, ReadmeToolConfigEntry } from "./types";

/**
 * Service for fetching and managing README files from GitHub repositories
 */
export class ReadmeService implements IReadmeService {
  private readonly logger: TsLogger;
  private readonly downloader: IDownloader;
  private readonly registry: IToolInstallationRegistry;
  private readonly fileSystem: IFileSystem;
  private readonly catalogFileSystem: TrackedFileSystem;
  private readonly readmeCache: ReadmeCache;
  private readonly pluginRegistry: InstallerPluginRegistry;

  constructor(
    parentLogger: TsLogger,
    downloader: IDownloader,
    registry: IToolInstallationRegistry,
    fileSystem: IFileSystem,
    catalogFileSystem: TrackedFileSystem,
    cacheDir: string,
    pluginRegistry: InstallerPluginRegistry,
  ) {
    this.logger = parentLogger.getSubLogger({ name: "ReadmeService" });
    this.downloader = downloader;
    this.registry = registry;
    this.fileSystem = fileSystem;
    this.catalogFileSystem = catalogFileSystem;
    this.pluginRegistry = pluginRegistry;

    // Create dedicated cache for README content
    const cache = new FileCache(this.logger, fileSystem, {
      enabled: true,
      defaultTtl: DEFAULT_README_CACHE_TTL,
      cacheDir,
      storageStrategy: "json",
    });

    this.readmeCache = new ReadmeCache(this.logger, cache);

    this.logger.debug(messages.serviceInitialized());
  }

  async fetchReadmeForVersion(
    owner: string,
    repo: string,
    version: string,
    toolName: string,
  ): Promise<IReadmeContent | null> {
    const cacheKey: string = this.readmeCache.generateCacheKey(owner, repo, version);

    // Check cache first
    const cached: IReadmeContent | null = await this.readmeCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    this.logger.debug(messages.readmeCacheMiss(owner, repo, version));

    // Construct raw GitHub URL
    const url: string = this.constructReadmeUrl(owner, repo, version);
    this.logger.debug(messages.urlConstruction(url));

    try {
      this.logger.debug(messages.fetchingReadme(owner, repo, version));

      // Download README content
      const response: Buffer | undefined = await this.downloader.download(this.logger, url);

      if (!response) {
        this.logger.debug(messages.readmeNotFound(owner, repo, version, url));
        return null;
      }

      const content: string = response.toString("utf-8");
      const readmeContent: IReadmeContent = {
        content,
        toolName,
        owner,
        repo,
        version,
        sourceUrl: url,
        fetchedAt: Date.now(),
      };

      this.logger.debug(messages.readmeFetched(owner, repo, version, content.length));

      // Cache the result
      await this.readmeCache.set(cacheKey, readmeContent, DEFAULT_README_CACHE_TTL);

      return readmeContent;
    } catch (error) {
      this.logger.error(messages.fetchError(owner, repo, version, "Download failed"), error);
      return null;
    }
  }

  async getCachedReadme(owner: string, repo: string, version: string): Promise<IReadmeContent | null> {
    const cacheKey: string = this.readmeCache.generateCacheKey(owner, repo, version);
    return await this.readmeCache.get(cacheKey);
  }

  async generateCombinedReadme(options: ICombinedReadmeOptions = {}): Promise<string> {
    const tools: IToolInstallationRecord[] = await this.getGitHubTools();

    this.logger.debug(messages.generatingCombinedReadme(tools.length));

    // Set default options
    const combinedOptions: Required<ICombinedReadmeOptions> = {
      title: options.title || "Installed Tools",
      includeTableOfContents: options.includeTableOfContents ?? true,
      includeVersions: options.includeVersions ?? true,
    };

    const sections: string[] = [];

    // Add title
    sections.push(`# ${combinedOptions.title}\n`);

    if (tools.length === 0) {
      sections.push("No GitHub tools are currently installed.\n");
      return sections.join("\n");
    }

    // Add table of contents if requested
    if (combinedOptions.includeTableOfContents) {
      this.addTableOfContents(sections, tools, combinedOptions.includeVersions);
    }

    // Fetch and add tool READMEs
    await this.addToolSections(sections, tools, combinedOptions);

    const result: string = sections.join("\n");
    this.logger.debug(messages.combinedReadmeGenerated(tools.length, result.length));

    return result;
  }

  private addTableOfContents(sections: string[], tools: IToolInstallationRecord[], includeVersions: boolean): void {
    sections.push("## Table of Contents\n");
    for (const tool of tools) {
      const versionSuffix: string = includeVersions ? ` (${tool.version})` : "";
      sections.push(`- [${tool.toolName}${versionSuffix}](#${tool.toolName.toLowerCase().replace(/[^a-z0-9]/g, "-")})`);
    }
    sections.push("");
  }

  private async addToolSections(
    sections: string[],
    tools: IToolInstallationRecord[],
    options: Required<ICombinedReadmeOptions>,
  ): Promise<void> {
    for (const tool of tools) {
      // Extract owner/repo from download URL
      const githubMatch = tool.downloadUrl?.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (!githubMatch) continue;

      const [, owner, repo] = githubMatch;
      if (!owner || !repo) continue;

      // Use originalTag if available (for GitHub URLs), otherwise use configuredVersion or installed version
      // If version is "latest", resolve to "main" for raw GitHub URLs
      const version = tool.originalTag || tool.configuredVersion || tool.version;
      const resolvedVersion = version === "latest" ? "main" : version;

      const readme: IReadmeContent | null = await this.fetchReadmeForVersion(
        owner,
        repo,
        resolvedVersion,
        tool.toolName,
      );

      const versionSuffix: string = options.includeVersions ? ` (${tool.version})` : "";
      sections.push(`## ${tool.toolName}${versionSuffix}\n`);

      if (readme) {
        this.addToolWithReadme(sections, tool, readme);
      } else {
        this.addToolWithoutReadme(sections, owner, repo);
      }
    }
  }

  private addToolWithReadme(sections: string[], tool: IToolInstallationRecord, readme: IReadmeContent): void {
    sections.push(readme.content);

    // Extract owner/repo from download URL
    const githubMatch = tool.downloadUrl?.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (githubMatch) {
      const [, owner, repo] = githubMatch;
      sections.push(`\n**Source:** [${owner}/${repo}](https://github.com/${owner}/${repo})\n`);
    }
  }

  private addToolWithoutReadme(sections: string[], owner: string, repo: string): void {
    sections.push(`**Repository:** [${owner}/${repo}](https://github.com/${owner}/${repo})\n`);
    sections.push("*README not available*\n");
  }

  async getGitHubTools(): Promise<IToolInstallationRecord[]> {
    this.logger.debug(messages.fetchingInstalledTools());

    try {
      const installations: IToolInstallationRecord[] = await this.registry.getAllToolInstallations();

      const githubTools: IToolInstallationRecord[] = installations.filter((installation) => {
        // For now, we'll use a simple heuristic to identify GitHub tools
        // This could be enhanced with better metadata tracking
        return installation.downloadUrl?.includes("github.com") || installation.downloadUrl?.includes("api.github.com");
      });

      this.logger.debug(messages.installedToolsFound(githubTools.length));
      return githubTools;
    } catch (error) {
      this.logger.error(messages.fetchError("registry", "tools", "unknown", "Failed to get installed tools"), error);
      return [];
    }
  }

  async clearExpiredCache(): Promise<void> {
    await this.readmeCache.clearExpired();
  }

  async writeReadmeToPath(
    destPath: string,
    toolName: string,
    version: string,
    owner: string,
    repo: string,
  ): Promise<string | null> {
    try {
      // Fetch or get cached README content
      const readme: IReadmeContent | null = await this.fetchReadmeForVersion(owner, repo, version, toolName);

      if (!readme) {
        this.logger.debug(messages.readmeNotAvailableForWrite(toolName, version));
        return null;
      }

      // Create file path: destPath/toolName/version/README.md
      const toolDir: string = `${destPath}/${toolName}`;
      const versionDir: string = `${toolDir}/${version}`;
      const filePath: string = `${versionDir}/README.md`;

      this.logger.debug(messages.writingReadmeToPath(toolName, version, filePath));

      // Ensure directories exist
      await this.fileSystem.ensureDir(versionDir);

      // Write README content to file
      await this.fileSystem.writeFile(filePath, readme.content);

      this.logger.debug(messages.readmeWritten(toolName, version, filePath, readme.content.length));

      return filePath;
    } catch (error) {
      const filePath: string = `${destPath}/${toolName}/${version}/README.md`;
      this.logger.error(messages.readmeWriteError(toolName, version, filePath, "Write operation failed"), error);
      return null;
    }
  }

  private constructReadmeUrl(owner: string, repo: string, version: string): string {
    return `${GITHUB_RAW_BASE_URL}/${owner}/${repo}/${version}/${README_FILENAME}`;
  }

  async generateCatalogFromConfigs(
    catalogPath: string,
    toolConfigs: Record<string, ToolConfig>,
    options: ICombinedReadmeOptions = {},
  ): Promise<string | null> {
    try {
      this.logger.debug(messages.catalogGeneration.started(catalogPath));

      // Check if there are any installed GitHub tools
      const installedTools: IToolInstallationRecord[] = await this.getGitHubTools();

      if (installedTools.length === 0) {
        this.logger.warn(messages.catalogGeneration.noGitHubTools());
        return null;
      }

      // Generate catalog content directly from configs
      const catalogContent: string = await this.generateCatalogContentFromConfigs(toolConfigs, options);

      // Ensure the parent directory exists before writing
      const parentDir: string = path.dirname(catalogPath);
      await this.fileSystem.ensureDir(parentDir);

      // Write the catalog to the specified path
      await this.catalogFileSystem.writeFile(catalogPath, catalogContent);

      this.logger.debug(messages.catalogGeneration.completed(catalogPath, catalogContent.length));
      return catalogPath;
    } catch (error) {
      this.logger.error(messages.catalogGeneration.failed(catalogPath, "Catalog generation failed"), error);
      return null;
    }
  }

  private async generateCatalogContentFromConfigs(
    toolConfigs: Record<string, ToolConfig>,
    options: ICombinedReadmeOptions = {},
  ): Promise<string> {
    const combinedOptions: Required<ICombinedReadmeOptions> = {
      title: options.title || "Tool Catalog",
      includeTableOfContents: options.includeTableOfContents ?? true,
      includeVersions: options.includeVersions ?? true,
    };

    const sections: string[] = [];
    sections.push(`# ${combinedOptions.title}\n`);

    const githubConfigs: ReadmeToolConfigEntry[] = this.filterGitHubConfigs(toolConfigs);

    this.logger.debug(messages.githubToolsExtracted(githubConfigs.length));

    if (combinedOptions.includeTableOfContents) {
      this.addCatalogTableOfContents(sections, githubConfigs, combinedOptions.includeVersions);
    }

    await this.addCatalogToolSections(sections, githubConfigs, combinedOptions);

    return sections.join("\n");
  }

  private filterGitHubConfigs(toolConfigs: Record<string, ToolConfig>): ReadmeToolConfigEntry[] {
    return Object.entries(toolConfigs).filter(([, config]) => {
      const plugin = this.pluginRegistry.get(config.installationMethod);
      return plugin?.supportsReadme?.() === true;
    });
  }

  private addCatalogTableOfContents(
    sections: string[],
    githubConfigs: ReadmeToolConfigEntry[],
    includeVersions: boolean,
  ): void {
    sections.push("## Table of Contents\n");
    for (const [toolName, config] of githubConfigs) {
      const versionSuffix: string = includeVersions ? ` (${config.version || "main"})` : "";
      sections.push(`- [${toolName}${versionSuffix}](#${toolName.toLowerCase().replace(/[^a-z0-9]/g, "-")})`);
    }
    sections.push("");
  }

  private async addCatalogToolSections(
    sections: string[],
    githubConfigs: ReadmeToolConfigEntry[],
    options: Required<ICombinedReadmeOptions>,
  ): Promise<void> {
    for (const [toolName, config] of githubConfigs) {
      if (config.installationMethod !== "github-release") continue;

      const githubParams = config.installParams;
      const repo = githubParams.repo;
      const [owner, repoName] = repo.split("/");
      if (!owner || !repoName) continue;

      const version = config.version || "main";
      const resolvedVersion = version === "latest" ? "main" : version;

      const readme: IReadmeContent | null = await this.fetchReadmeForVersion(
        owner,
        repoName,
        resolvedVersion,
        toolName,
      );

      const versionSuffix: string = options.includeVersions ? ` (${version})` : "";
      sections.push(`## ${toolName}${versionSuffix}\n`);

      if (readme) {
        this.addCatalogToolWithReadme(sections, readme, repo);
      } else {
        this.addCatalogToolWithoutReadme(sections, repo);
      }
    }
  }

  private addCatalogToolWithReadme(sections: string[], readme: IReadmeContent, repo: string): void {
    sections.push(readme.content);
    sections.push(`\n**Source:** [${repo}](https://github.com/${repo})\n`);
  }

  private addCatalogToolWithoutReadme(sections: string[], repo: string): void {
    sections.push(`**Repository:** [${repo}](https://github.com/${repo})\n`);
    sections.push("*README not available*\n");
  }
}
