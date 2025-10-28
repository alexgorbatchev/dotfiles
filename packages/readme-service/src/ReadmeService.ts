import type { IDownloader } from '@dotfiles/downloader';
import { FileCache } from '@dotfiles/downloader';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import type { IToolInstallationRegistry, ToolInstallation } from '@dotfiles/registry';
import type { IReadmeService } from './IReadmeService';
import type { CombinedReadmeOptions, InstalledTool, ReadmeContent } from './types';
import { ReadmeCache } from './ReadmeCache';
import { GITHUB_RAW_BASE_URL, README_FILENAME, DEFAULT_README_CACHE_TTL } from './constants';
import { messages } from './log-messages';

/**
 * Service for fetching and managing README files from GitHub repositories
 */
export class ReadmeService implements IReadmeService {
  private readonly logger: TsLogger;
  private readonly downloader: IDownloader;
  private readonly registry: IToolInstallationRegistry;
  private readonly fileSystem: IFileSystem;
  private readonly readmeCache: ReadmeCache;

  constructor(
    parentLogger: TsLogger,
    downloader: IDownloader,
    registry: IToolInstallationRegistry,
    fileSystem: IFileSystem,
    cacheDir: string
  ) {
    this.logger = parentLogger.getSubLogger({ name: 'ReadmeService' });
    this.downloader = downloader;
    this.registry = registry;
    this.fileSystem = fileSystem;

    // Create dedicated cache for README content
    const cache = new FileCache(this.logger, fileSystem, {
      enabled: true,
      defaultTtl: DEFAULT_README_CACHE_TTL,
      cacheDir,
      storageStrategy: 'json',
    });

    this.readmeCache = new ReadmeCache(this.logger, cache);

    this.logger.debug(messages.serviceInitialized());
  }

  async fetchReadmeForVersion(
    owner: string,
    repo: string,
    version: string,
    toolName: string
  ): Promise<ReadmeContent | null> {
    const cacheKey: string = this.readmeCache.generateCacheKey(owner, repo, version);

    // Check cache first
    const cached: ReadmeContent | null = await this.readmeCache.get(cacheKey);
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
      const response: Buffer | undefined = await this.downloader.download(url);

      if (!response) {
        this.logger.debug(messages.readmeNotFound(owner, repo, version, url));
        return null;
      }

      const content: string = response.toString('utf-8');
      const readmeContent: ReadmeContent = {
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
      this.logger.error(
        messages.fetchError(owner, repo, version, error instanceof Error ? error.message : String(error))
      );
      return null;
    }
  }

  async getCachedReadme(owner: string, repo: string, version: string): Promise<ReadmeContent | null> {
    const cacheKey: string = this.readmeCache.generateCacheKey(owner, repo, version);
    return await this.readmeCache.get(cacheKey);
  }

  async generateCombinedReadme(options: CombinedReadmeOptions = {}): Promise<string> {
    const tools: InstalledTool[] = await this.getGitHubTools();

    this.logger.debug(messages.generatingCombinedReadme(tools.length));

    // Set default options
    const combinedOptions: Required<CombinedReadmeOptions> = {
      title: options.title || 'Installed Tools',
      includeTableOfContents: options.includeTableOfContents ?? true,
      maxDescriptionLength: options.maxDescriptionLength || 200,
      includeVersions: options.includeVersions ?? true,
    };

    const sections: string[] = [];

    // Add title
    sections.push(`# ${combinedOptions.title}\n`);

    if (tools.length === 0) {
      sections.push('No GitHub tools are currently installed.\n');
      return sections.join('\n');
    }

    // Add table of contents if requested
    if (combinedOptions.includeTableOfContents) {
      this.addTableOfContents(sections, tools, combinedOptions.includeVersions);
    }

    // Fetch and add tool READMEs
    await this.addToolSections(sections, tools, combinedOptions);

    const result: string = sections.join('\n');
    this.logger.debug(messages.combinedReadmeGenerated(tools.length, result.length));

    return result;
  }

  private addTableOfContents(sections: string[], tools: InstalledTool[], includeVersions: boolean): void {
    sections.push('## Table of Contents\n');
    for (const tool of tools) {
      const versionSuffix: string = includeVersions ? ` (${tool.version})` : '';
      sections.push(`- [${tool.name}${versionSuffix}](#${tool.name.toLowerCase().replace(/[^a-z0-9]/g, '-')})`);
    }
    sections.push('');
  }

  private async addToolSections(
    sections: string[],
    tools: InstalledTool[],
    options: Required<CombinedReadmeOptions>
  ): Promise<void> {
    for (const tool of tools) {
      if (!tool.owner || !tool.repo) continue;

      const readme: ReadmeContent | null = await this.fetchReadmeForVersion(
        tool.owner,
        tool.repo,
        tool.version,
        tool.name
      );

      const versionSuffix: string = options.includeVersions ? ` (${tool.version})` : '';
      sections.push(`## ${tool.name}${versionSuffix}\n`);

      if (readme) {
        this.addToolWithReadme(sections, tool, readme, options.maxDescriptionLength);
      } else {
        this.addToolWithoutReadme(sections, tool);
      }
    }
  }

  private addToolWithReadme(
    sections: string[],
    tool: InstalledTool,
    readme: ReadmeContent,
    maxDescriptionLength: number
  ): void {
    let description: string = this.extractDescription(readme.content);

    if (maxDescriptionLength > 0 && description.length > maxDescriptionLength) {
      description = `${description.substring(0, maxDescriptionLength)}...`;
    }

    sections.push(description);
    sections.push(`\n**Source:** [${tool.owner}/${tool.repo}](https://github.com/${tool.owner}/${tool.repo})\n`);
  }

  private addToolWithoutReadme(sections: string[], tool: InstalledTool): void {
    sections.push(`**Repository:** [${tool.owner}/${tool.repo}](https://github.com/${tool.owner}/${tool.repo})\n`);
    sections.push('*README not available*\n');
  }

  async getGitHubTools(): Promise<InstalledTool[]> {
    this.logger.debug(messages.fetchingInstalledTools());

    try {
      const installations: ToolInstallation[] = await this.registry.getAllToolInstallations();

      const githubTools: InstalledTool[] = installations
        .filter((installation: ToolInstallation) => {
          // For now, we'll use a simple heuristic to identify GitHub tools
          // This could be enhanced with better metadata tracking
          return (
            installation.downloadUrl?.includes('github.com') || installation.downloadUrl?.includes('api.github.com')
          );
        })
        .map((installation: ToolInstallation) => {
          // Extract owner/repo from download URL
          const githubMatch = installation.downloadUrl?.match(/github\.com\/([^/]+)\/([^/]+)/);
          return {
            name: installation.toolName,
            version: installation.version,
            installMethod: 'github-release', // Assumption for GitHub tools
            owner: githubMatch?.[1],
            repo: githubMatch?.[2],
          };
        })
        .filter((tool: InstalledTool) => tool.owner && tool.repo);

      this.logger.debug(messages.installedToolsFound(githubTools.length));
      return githubTools;
    } catch (error) {
      this.logger.error(
        messages.fetchError('registry', 'tools', 'unknown', error instanceof Error ? error.message : String(error))
      );
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
    repo: string
  ): Promise<string | null> {
    try {
      // Fetch or get cached README content
      const readme: ReadmeContent | null = await this.fetchReadmeForVersion(owner, repo, version, toolName);

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
      const errorMessage: string = error instanceof Error ? error.message : String(error);
      const filePath: string = `${destPath}/${toolName}/${version}/README.md`;
      this.logger.error(messages.readmeWriteError(toolName, version, filePath, errorMessage));
      return null;
    }
  }

  private constructReadmeUrl(owner: string, repo: string, version: string): string {
    return `${GITHUB_RAW_BASE_URL}/${owner}/${repo}/${version}/${README_FILENAME}`;
  }

  private extractDescription(content: string): string {
    // Remove the title (first # heading)
    const lines: string[] = content.split('\n');
    const descriptionLines: string[] = [];
    let foundTitle: boolean = false;

    for (const line of lines) {
      const trimmed: string = line.trim();

      // Skip the first title
      if (!foundTitle && trimmed.startsWith('# ')) {
        foundTitle = true;
        continue;
      }

      // Stop at the next heading
      if (foundTitle && (trimmed.startsWith('# ') || trimmed.startsWith('## '))) {
        break;
      }

      if (foundTitle && trimmed) {
        descriptionLines.push(trimmed);
      }
    }

    return descriptionLines.join(' ').trim() || 'No description available.';
  }
}
