import path from 'node:path';
import type { ProjectConfig } from '@dotfiles/config';
import type { ShellCompletionConfig, ShellScript, ShellType, ToolConfig } from '@dotfiles/core';
import { getScriptContent, isAlwaysScript, isOnceScript } from '@dotfiles/core';
import { AlwaysScriptFormatter, OnceScriptFormatter } from '../script-formatters';
import { OnceScriptInitializer } from '../script-initializers';
import {
  generateDefaultPathModification,
  generateEndOfFile,
  generateFileHeader,
  generateHoistingAttribution,
  generateHoistingExplanation,
  generateSectionHeader,
  generateToolHeader,
} from '../shellTemplates';
import type { IAdditionalShellFile, IShellGenerator, IShellInitContent } from './IShellGenerator';

/**
 * Interface for shell-specific string generation strategy.
 * Each shell type implements this to handle shell-specific syntax.
 */
export interface IShellStringProducer {
  /**
   * Extracts shell-specific init scripts from tool config.
   */
  extractInitScripts(toolConfig: ToolConfig): ShellScript[];

  /**
   * Processes completions configuration into shell-specific setup strings.
   */
  processCompletions(toolName: string, completions: ShellCompletionConfig): string[];

  /**
   * Processes environment variables into shell-specific export statements.
   */
  processEnvironmentVariables(toolConfig: ToolConfig): string[];

  /**
   * Processes aliases into shell-specific alias commands.
   */
  processAliases(toolConfig: ToolConfig): string[];

  /**
   * Generates shell-specific completion setup if needed.
   */
  generateCompletionSetup?(allCompletionSetup: string[], allToolInits: string[]): string[];
}

/**
 * Abstract base class for shell generators that contains all shared logic.
 * Shell-specific implementations only need to provide a string producer strategy.
 */
export abstract class BaseShellGenerator implements IShellGenerator {
  abstract readonly shellType: ShellType;
  abstract readonly fileExtension: string;

  protected readonly projectConfig: ProjectConfig;
  protected readonly stringProducer: IShellStringProducer;

  constructor(projectConfig: ProjectConfig, stringProducer: IShellStringProducer) {
    this.projectConfig = projectConfig;
    this.stringProducer = stringProducer;
  }

  protected abstract getShellConfig(toolConfig: ToolConfig): { completions?: ShellCompletionConfig } | undefined;

  extractShellContent(toolName: string, toolConfig: ToolConfig): IShellInitContent {
    const content: IShellInitContent = {
      configFilePath: toolConfig.configFilePath,
      toolInit: [],
      pathModifications: [],
      environmentVariables: [],
      completionSetup: [],
      onceScripts: [],
      alwaysScripts: [],
    };

    // Use string producer to extract shell-specific scripts
    const scripts = this.stringProducer.extractInitScripts(toolConfig);
    scripts.forEach((script: ShellScript) => {
      if (isOnceScript(script)) {
        content.onceScripts.push(script);
      } else if (isAlwaysScript(script)) {
        content.alwaysScripts.push(script);
      }
    });

    // Process declarative environment variables
    const envVars = this.stringProducer.processEnvironmentVariables(toolConfig);
    content.environmentVariables.push(...envVars);

    // Process declarative aliases as tool init
    const aliases = this.stringProducer.processAliases(toolConfig);
    content.toolInit.push(...aliases);

    // Process shell-specific completions
    const shellConfig = this.getShellConfig(toolConfig);
    if (shellConfig?.completions) {
      const completionSetup = this.stringProducer.processCompletions(toolName, shellConfig.completions);
      content.completionSetup.push(...completionSetup);
    }

    return content;
  }

  processCompletions(toolName: string, completions: ShellCompletionConfig): string[] {
    return this.stringProducer.processCompletions(toolName, completions);
  }

  generateFileContent(toolContents: Map<string, IShellInitContent>): string {
    const allPathModifications: string[] = [];
    const allEnvironmentVariables: string[] = [];
    const allCompletionSetup: string[] = [];
    let hasOnceScripts = false;

    // Initialize formatters
    const onceInitializer = new OnceScriptInitializer();

    // Add default PATH modification first
    allPathModifications.push(generateDefaultPathModification(this.shellType, this.projectConfig.paths.targetDir));

    // Collect hoisted content from all tools
    this.collectHoistedContent(toolContents, allPathModifications, allEnvironmentVariables, allCompletionSetup);

    // Check if any tools have once scripts
    for (const [, content] of toolContents) {
      if (content.onceScripts.length > 0) {
        hasOnceScripts = true;
        break;
      }
    }

    let fileContent = `${generateFileHeader(this.shellType, this.projectConfig.paths.dotfilesDir)}\n`;

    // Add once script initialization if any tools use once scripts
    if (hasOnceScripts) {
      const initialization = onceInitializer.initialize(this.shellType, this.projectConfig.paths.shellScriptsDir);
      fileContent += `${initialization.content}\n\n`;
    }

    // Add PATH modifications section with hoisting comments
    fileContent += this.generateHoistedSection(
      'PATH Modifications',
      allPathModifications,
      toolContents,
      'pathModifications'
    );

    // Add environment variables section with hoisting comments
    fileContent += this.generateHoistedSection(
      'Environment Variables',
      allEnvironmentVariables,
      toolContents,
      'environmentVariables'
    );

    // Add tool-specific initializations section with all tool content grouped together
    fileContent += this.generateToolSection(toolContents);

    // Add shell completions setup section
    if (allCompletionSetup.length > 0) {
      fileContent += `${generateSectionHeader(this.shellType, 'Shell Completions Setup')}\n`;

      // Use string producer for shell-specific completion setup if available
      const completionSetupStrings = this.stringProducer.generateCompletionSetup
        ? this.stringProducer.generateCompletionSetup(allCompletionSetup, [])
        : [...new Set(allCompletionSetup)];

      fileContent += `${completionSetupStrings.join('\n')}\n\n`;
    }

    fileContent += `\n${generateEndOfFile(this.shellType)}`;

    return fileContent;
  }

  getDefaultOutputPath(): string {
    return path.join(this.projectConfig.paths.shellScriptsDir, `main${this.fileExtension}`);
  }

  getAdditionalFiles(toolContents: Map<string, IShellInitContent>): IAdditionalShellFile[] {
    const additionalFiles: IAdditionalShellFile[] = [];
    const onceFormatter = new OnceScriptFormatter(this.projectConfig.paths.shellScriptsDir);

    for (const [toolName, content] of toolContents) {
      for (let i = 0; i < content.onceScripts.length; i++) {
        const script = content.onceScripts[i];
        if (script) {
          const formatted = onceFormatter.format(script, toolName, this.shellType, i);
          if (formatted.outputPath) {
            additionalFiles.push({
              content: formatted.content,
              outputPath: formatted.outputPath,
            });
          }
        }
      }
    }

    return additionalFiles;
  }

  /**
   * Collects hoisted content from all tools (PATH, env vars, completions).
   * Tool-specific content (toolInit, alwaysScripts) is handled in generateToolSection.
   */
  private collectHoistedContent(
    toolContents: Map<string, IShellInitContent>,
    allPathModifications: string[],
    allEnvironmentVariables: string[],
    allCompletionSetup: string[]
  ): void {
    for (const [, content] of toolContents) {
      allPathModifications.push(...content.pathModifications);
      allEnvironmentVariables.push(...content.environmentVariables);
      allCompletionSetup.push(...content.completionSetup);
    }
  }

  /**
   * Generates the tool section with all content grouped under tool headers.
   * Each tool gets a header followed by its always scripts and tool init content.
   */
  private generateToolSection(toolContents: Map<string, IShellInitContent>): string {
    const alwaysFormatter = new AlwaysScriptFormatter();
    let hasContent = false;

    // Check if any tool has content to render
    for (const [, content] of toolContents) {
      if (content.toolInit.length > 0 || content.alwaysScripts.length > 0) {
        hasContent = true;
        break;
      }
    }

    if (!hasContent) {
      return '';
    }

    let section = `${generateSectionHeader(this.shellType, 'Tool-Specific Initializations')}\n`;

    for (const [toolName, content] of toolContents) {
      const hasToolContent = content.toolInit.length > 0 || content.alwaysScripts.length > 0;

      if (!hasToolContent) {
        continue;
      }

      // Add tool header
      const toolHeader = generateToolHeader(this.shellType, content.configFilePath);
      section += toolHeader;

      // Add always scripts for this tool
      const formattedAlwaysScripts: string[] = [];
      for (const script of content.alwaysScripts) {
        const formatted = alwaysFormatter.format(script, toolName, this.shellType);
        formattedAlwaysScripts.push(formatted.content);
      }

      if (formattedAlwaysScripts.length > 0) {
        section += `\n${formattedAlwaysScripts.join('\n\n')}`;
      }

      // Add tool init (aliases, etc.)
      if (content.toolInit.length > 0) {
        section += `\n${content.toolInit.join('\n')}`;
      }

      section += '\n';
    }

    return `${section}\n`;
  }

  /**
   * Generates a hoisted section with comments indicating original source.
   */
  private generateHoistedSection(
    sectionTitle: string,
    items: string[],
    toolContents: Map<string, IShellInitContent>,
    contentType: keyof IShellInitContent
  ): string {
    if (items.length === 0) return '';

    let section = `${generateSectionHeader(this.shellType, sectionTitle)}\n`;

    // Add hoisting explanation comment
    section += `${generateHoistingExplanation(this.shellType, sectionTitle)}\n`;

    // For PATH modifications, ensure generated bin directory is first
    if (sectionTitle === 'PATH Modifications') {
      const uniquePaths = [...new Set(items)];
      const generatedBinPathLine = uniquePaths.find((p) => p.includes(this.projectConfig.paths.binariesDir));
      if (generatedBinPathLine) {
        section += `${generatedBinPathLine}\n`;
        uniquePaths.splice(uniquePaths.indexOf(generatedBinPathLine), 1);
      }

      // Add remaining paths with source attribution
      for (const item of uniquePaths) {
        const sourceTools = this.findSourceTools(item, toolContents, contentType);
        const attribution = generateHoistingAttribution(this.shellType, sourceTools);
        if (attribution) {
          section += `${attribution}\n`;
        }
        section += `${item}\n`;
      }
    } else {
      // For other sections, add items with source attribution
      const uniqueItems = [...new Set(items)];
      for (const item of uniqueItems) {
        const sourceTools = this.findSourceTools(item, toolContents, contentType);
        const attribution = generateHoistingAttribution(this.shellType, sourceTools);
        if (attribution) {
          section += `${attribution}\n`;
        }
        section += `${item}\n`;
      }
    }

    return `${section}\n`;
  }

  /**
   * Finds which tools contributed a specific item to a content type.
   */
  private findSourceTools(
    item: string,
    toolContents: Map<string, IShellInitContent>,
    contentType: keyof IShellInitContent
  ): string[] {
    const sourceTools: string[] = [];

    for (const [toolName, content] of toolContents) {
      const contentArray = content[contentType];
      if (Array.isArray(contentArray)) {
        // Handle both plain strings and ShellScript branded types
        const hasMatch = contentArray.some((arrayItem) => {
          if (typeof arrayItem === 'string') {
            return arrayItem === item;
          }
          // For ShellScript branded types, compare the content
          return getScriptContent(arrayItem as ShellScript) === item;
        });
        if (hasMatch) {
          sourceTools.push(toolName);
        }
      }
    }

    return sourceTools;
  }
}
