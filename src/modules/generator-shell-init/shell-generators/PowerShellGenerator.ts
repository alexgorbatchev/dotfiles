import path from 'node:path';
import type { ShellType, ToolConfig, CompletionConfig, ShellScript } from '@types';
import { isOnceScript, isAlwaysScript, getScriptContent } from '@types';
import type { YamlConfig } from '@modules/config';
import type { IShellGenerator, ShellInitContent, AdditionalShellFile } from './IShellGenerator';
import { AlwaysScriptFormatter, OnceScriptFormatter } from '../script-formatters';
import { OnceScriptInitializer } from '../script-initializers';
import { generateFileHeader, generateSectionHeader, generateToolHeader, generateHoistingExplanation, generateHoistingAttribution, generateDefaultPathModification, generateEndOfFile } from '../shellTemplates';

/**
 * PowerShell-specific shell initialization generator.
 * Handles PowerShell syntax and conventions for PATH, environment variables,
 * completions, and tool-specific initialization.
 */
export class PowerShellGenerator implements IShellGenerator {
  readonly shellType: ShellType = 'powershell';
  readonly fileExtension: string = '.ps1';
  
  private readonly appConfig: YamlConfig;

  constructor(appConfig: YamlConfig) {
    this.appConfig = appConfig;
  }

  extractShellContent(_toolName: string, toolConfig: ToolConfig): ShellInitContent {
    const content: ShellInitContent = {
      configFilePath: toolConfig.configFilePath,
      toolInit: [],
      pathModifications: [],
      environmentVariables: [],
      completionSetup: [],
      onceScripts: [],
      alwaysScripts: [],
    };

    if (toolConfig.powershellInit && toolConfig.powershellInit.length > 0) {
      toolConfig.powershellInit.forEach((script: ShellScript) => {
        if (isOnceScript(script)) {
          content.onceScripts.push(script);
        } else if (isAlwaysScript(script)) {
          content.alwaysScripts.push(script);
        }
      });
    }

    return content;
  }

  processCompletions(toolName: string, completions: CompletionConfig): string[] {
    const completionSetup: string[] = [];
    
    if (completions.powershell) {
      const shellConfig = completions.powershell;
      const completionDir = shellConfig.targetDir ?? path.join(this.appConfig.paths.shellScriptsDir, 'powershell');
      const completionFile = path.join(completionDir, shellConfig.name ?? `${toolName}.ps1`);
      
      // Source the completion file if it exists
      completionSetup.push(`if (Test-Path "${completionFile}") { . "${completionFile}" }`);
    }

    return completionSetup;
  }

  generateFileContent(toolContents: Map<string, ShellInitContent>): string {
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
    allPathModifications.push(generateDefaultPathModification(this.shellType, this.appConfig.paths.binariesDir));

    // Collect content from all tools with proper attribution
    this.collectContentWithAttribution(toolContents, allPathModifications, allEnvironmentVariables, allToolInits, allCompletionSetup);

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

    let fileContent = generateFileHeader(this.shellType, this.appConfig.paths.dotfilesDir) + '\n';

    // Add once script initialization if any tools use once scripts
    if (hasOnceScripts) {
      const initialization = onceInitializer.initialize(this.shellType, this.appConfig.paths.shellScriptsDir);
      fileContent += initialization.content + '\n\n';
    }

    // Add PATH modifications section with hoisting comments
    fileContent += this.generateHoistedSection('PATH Modifications', allPathModifications, toolContents, 'pathModifications');

    // Add environment variables section with hoisting comments
    fileContent += this.generateHoistedSection('Environment Variables', allEnvironmentVariables, toolContents, 'environmentVariables');

    // Add formatted always scripts section
    if (formattedAlwaysScripts.length > 0) {
      fileContent += `${generateSectionHeader(this.shellType, 'Always Scripts')}\n`;
      fileContent += formattedAlwaysScripts.join('\n\n') + '\n\n';
    }

    // Add tool-specific initializations section with file headers
    fileContent += this.generateToolInitSection(allToolInits, toolContents);

    // Add shell completions setup section
    if (allCompletionSetup.length > 0) {
      fileContent += `${generateSectionHeader(this.shellType, 'Shell Completions Setup')}\n`;
      fileContent += [...new Set(allCompletionSetup)].join('\n') + '\n\n';
    }

    fileContent += `\n${generateEndOfFile(this.shellType)}`;

    return fileContent;
  }

  getDefaultOutputPath(): string {
    return path.join(this.appConfig.paths.shellScriptsDir, `main${this.fileExtension}`);
  }


  /**
   * Collects content from all tools with proper attribution.
   */
  private collectContentWithAttribution(
    toolContents: Map<string, ShellInitContent>,
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
    toolContents: Map<string, ShellInitContent>,
    contentType: keyof ShellInitContent
  ): string {
    if (items.length === 0) return '';

    let section = `${generateSectionHeader(this.shellType, sectionTitle)}\n`;
    
    // Add hoisting explanation comment
    section += generateHoistingExplanation(this.shellType, sectionTitle) + '\n';

    // For PATH modifications, ensure generated bin directory is first
    if (sectionTitle === 'PATH Modifications') {
      const uniquePaths = [...new Set(items)];
      const generatedBinPathLine = uniquePaths.find((p) =>
        p.includes(this.appConfig.paths.binariesDir)
      );
      if (generatedBinPathLine) {
        section += generatedBinPathLine + '\n';
        uniquePaths.splice(uniquePaths.indexOf(generatedBinPathLine), 1);
      }
      
      // Add remaining paths with source attribution
      for (const item of uniquePaths) {
        const sourceTools = this.findSourceTools(item, toolContents, contentType);
        const attribution = generateHoistingAttribution(this.shellType, sourceTools);
        if (attribution) {
          section += attribution + '\n';
        }
        section += item + '\n';
      }
    } else {
      // For other sections, add items with source attribution
      const uniqueItems = [...new Set(items)];
      for (const item of uniqueItems) {
        const sourceTools = this.findSourceTools(item, toolContents, contentType);
        const attribution = generateHoistingAttribution(this.shellType, sourceTools);
        if (attribution) {
          section += attribution + '\n';
        }
        section += item + '\n';
      }
    }

    return section + '\n';
  }

  /**
   * Generates the tool-specific initialization section with file path headers.
   */
  private generateToolInitSection(allToolInits: string[], toolContents: Map<string, ShellInitContent>): string {
    if (allToolInits.length === 0) return '';

    let section = `${generateSectionHeader(this.shellType, 'Tool-Specific Initializations')}\n`;
    
    // Group tool inits by tool
    const toolGroups = new Map<string, { content: string[]; filePath?: string }>();
    
    for (const [toolName, content] of toolContents) {
      if (content.toolInit.length > 0) {
        toolGroups.set(toolName, {
          content: content.toolInit,
          filePath: content.configFilePath
        });
      }
    }

    // Generate content for each tool with proper headers
    for (const [toolName, { content, filePath }] of toolGroups) {
      const toolHeader = generateToolHeader(this.shellType, toolName, filePath);
      section += toolHeader + '\n';
      section += content.join('\n') + '\n';
    }

    return section + '\n';
  }

  /**
   * Finds which tools contributed a specific item to a content type.
   */
  private findSourceTools(
    item: string,
    toolContents: Map<string, ShellInitContent>,
    contentType: keyof ShellInitContent
  ): string[] {
    const sourceTools: string[] = [];
    
    for (const [toolName, content] of toolContents) {
      const contentArray = content[contentType];
      if (Array.isArray(contentArray)) {
        // Handle both plain strings and ShellScript branded types
        const hasMatch = contentArray.some(arrayItem => {
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

  getAdditionalFiles(toolContents: Map<string, ShellInitContent>): AdditionalShellFile[] {
    const additionalFiles: AdditionalShellFile[] = [];
    const onceFormatter = new OnceScriptFormatter(this.appConfig.paths.shellScriptsDir);

    for (const [toolName, content] of toolContents) {
      for (let i = 0; i < content.onceScripts.length; i++) {
        const script = content.onceScripts[i];
        const formatted = onceFormatter.format(script, toolName, this.shellType, i);
        additionalFiles.push({
          content: formatted.content,
          outputPath: formatted.outputPath!,
        });
      }
    }

    return additionalFiles;
  }
}