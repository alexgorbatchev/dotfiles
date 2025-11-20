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
    const allToolInits: string[] = [];
    const allCompletionSetup: string[] = [];
    const formattedAlwaysScripts: string[] = [];
    let hasOnceScripts = false;

    // Initialize formatters
    const alwaysFormatter = new AlwaysScriptFormatter();
    const onceInitializer = new OnceScriptInitializer();

    // Add default PATH modification first
    allPathModifications.push(generateDefaultPathModification(this.shellType, this.projectConfig.paths.targetDir));

    // Collect content from all tools with proper attribution
    this.collectContentWithAttribution(
      toolContents,
      allPathModifications,
      allEnvironmentVariables,
      allToolInits,
      allCompletionSetup
    );

    // Process branded scripts from all tools
    for (const [toolName, content] of toolContents) {
      // Format always scripts
      for (const script of content.alwaysScripts) {
        const formatted = alwaysFormatter.format(script, toolName, this.shellType);
        formattedAlwaysScripts.push(formatted.content);
      }

      // Check if any tools have once scripts
      if (content.onceScripts.length > 0) {
        hasOnceScripts = true;
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

    // Add formatted always scripts section
    if (formattedAlwaysScripts.length > 0) {
      fileContent += `${generateSectionHeader(this.shellType, 'Always Scripts')}\n`;
      fileContent += `${formattedAlwaysScripts.join('\n\n')}\n\n`;
    }

    // Add tool-specific initializations section with file headers
    fileContent += this.generateToolInitSection(allToolInits, toolContents);

    // Add shell completions setup section
    if (allCompletionSetup.length > 0) {
      fileContent += `${generateSectionHeader(this.shellType, 'Shell Completions Setup')}\n`;

      // Use string producer for shell-specific completion setup if available
      const completionSetupStrings = this.stringProducer.generateCompletionSetup
        ? this.stringProducer.generateCompletionSetup(allCompletionSetup, allToolInits)
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
   * Collects content from all tools with proper attribution.
   */
  private collectContentWithAttribution(
    toolContents: Map<string, IShellInitContent>,
    allPathModifications: string[],
    allEnvironmentVariables: string[],
    allToolInits: string[],
    allCompletionSetup: string[]
  ): void {
    for (const [, content] of toolContents) {
      allPathModifications.push(...content.pathModifications);
      allEnvironmentVariables.push(...content.environmentVariables);
      allToolInits.push(...content.toolInit);
      allCompletionSetup.push(...content.completionSetup);
      // Note: onceScripts and alwaysScripts are handled separately in generateFileContent()
    }
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
   * Generates the tool-specific initialization section with file path headers.
   */
  private generateToolInitSection(allToolInits: string[], toolContents: Map<string, IShellInitContent>): string {
    if (allToolInits.length === 0) return '';

    let section = `${generateSectionHeader(this.shellType, 'Tool-Specific Initializations')}\n`;

    // Group tool inits by tool
    const toolGroups = new Map<string, { content: string[]; filePath?: string }>();

    for (const [toolName, content] of toolContents) {
      if (content.toolInit.length > 0) {
        toolGroups.set(toolName, {
          content: content.toolInit,
          filePath: content.configFilePath,
        });
      }
    }

    // Generate content for each tool with proper headers
    for (const [toolName, { content, filePath }] of toolGroups) {
      const toolHeader = generateToolHeader(this.shellType, toolName, filePath);
      section += `${toolHeader}\n`;
      section += `${content.join('\n')}\n`;
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
