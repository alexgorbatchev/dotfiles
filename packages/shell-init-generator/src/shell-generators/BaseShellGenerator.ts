import type { ProjectConfig } from '@dotfiles/config';
import type {
  ShellCompletionConfig,
  ShellCompletionConfigInput,
  ShellScript,
  ShellType,
  ShellTypeConfig,
  ToolConfig,
} from '@dotfiles/core';
import { getScriptContent, isAlwaysScript, isOnceScript, isRawScript } from '@dotfiles/core';
import type { Emission, FormatterConfig, RenderedOutput } from '@dotfiles/shell-emissions';
import {
  alias,
  BlockBuilder,
  BlockRenderer,
  completion,
  environment,
  fn,
  path as pathEmission,
  script,
  SectionPriority,
  withPriority,
  withSource,
} from '@dotfiles/shell-emissions';
import path from 'node:path';
import { createEmissionFormatter } from '../formatters';
import type { IAdditionalShellFile, IShellGenerator } from './IShellGenerator';

/**
 * Abstract base class for shell generators that contains all shared logic.
 * Shell-specific implementations only need to provide shell type information
 * and the method to extract shell-specific configuration.
 */
export abstract class BaseShellGenerator implements IShellGenerator {
  abstract readonly shellType: ShellType;
  abstract readonly fileExtension: string;

  protected readonly projectConfig: ProjectConfig;

  constructor(projectConfig: ProjectConfig) {
    this.projectConfig = projectConfig;
  }

  /**
   * Extracts shell-specific configuration from a tool config.
   * Each shell generator implements this to return its shell's config section.
   */
  protected abstract getShellConfig(toolConfig: ToolConfig): ShellTypeConfig | undefined;

  /**
   * Gets the completion directory path for this shell.
   */
  protected abstract getCompletionDir(): string;

  /**
   * Extracts typed emissions directly from a tool configuration.
   * This is the primary content extraction method - emits structured data
   * without intermediate string representation.
   */
  extractEmissions(toolConfig: ToolConfig): Emission[] {
    const emissions: Emission[] = [];
    const source = toolConfig.configFilePath;
    const shellConfig = this.getShellConfig(toolConfig);

    // Process environment variables
    if (shellConfig?.environment) {
      const envEmission = environment(shellConfig.environment);
      emissions.push(source ? withSource(envEmission, source) : envEmission);
    }

    // Process aliases
    if (shellConfig?.aliases) {
      const aliasEmission = alias(shellConfig.aliases);
      emissions.push(source ? withSource(aliasEmission, source) : aliasEmission);
    }

    // Process shell functions
    if (shellConfig?.functions) {
      for (const [funcName, funcBody] of Object.entries(shellConfig.functions)) {
        const funcEmission = fn(funcName, funcBody);
        emissions.push(source ? withSource(funcEmission, source) : funcEmission);
      }
    }

    // Process scripts
    if (shellConfig?.scripts) {
      for (const shellScript of shellConfig.scripts) {
        const scriptEmission = this.createScriptEmission(shellScript);
        if (scriptEmission) {
          emissions.push(source ? withSource(scriptEmission, source) : scriptEmission);
        }
      }
    }

    // Process completions
    if (shellConfig?.completions) {
      const resolvedConfig = this.resolveCompletionConfig(shellConfig.completions);
      if (resolvedConfig) {
        const completionEmission = this.createCompletionEmission(resolvedConfig);
        if (completionEmission) {
          emissions.push(source ? withSource(completionEmission, source) : completionEmission);
        }
      }
    }

    return emissions;
  }

  /**
   * Creates a script emission from a ShellScript.
   */
  private createScriptEmission(shellScript: ShellScript): Emission | undefined {
    const scriptContent = getScriptContent(shellScript);

    if (isOnceScript(shellScript)) {
      return script(scriptContent, 'once');
    } else if (isAlwaysScript(shellScript)) {
      return script(scriptContent, 'always');
    } else if (isRawScript(shellScript)) {
      return script(scriptContent, 'raw');
    }

    return undefined;
  }

  /**
   * Creates a completion emission from resolved completion config.
   * Default uses files-based completion (Bash, PowerShell).
   * Override in ZshGenerator for fpath directory-based completion.
   */
  protected createCompletionEmission(config: ShellCompletionConfig): Emission | undefined {
    const completionDir = this.getCompletionDir();

    if (config.cmd || config.source) {
      return completion({
        files: [completionDir],
      });
    }

    return undefined;
  }

  /**
   * Resolves a completion config input to a static config for shell init processing.
   * For callbacks, returns a minimal config with default settings since the actual
   * completion generation happens separately in GeneratorOrchestrator.
   */
  private resolveCompletionConfig(input: ShellCompletionConfigInput): ShellCompletionConfig | undefined {
    // If it's a function, return a minimal config to set up fpath
    // The actual completion content is generated by GeneratorOrchestrator
    if (typeof input === 'function') {
      const defaultConfig: ShellCompletionConfig = { source: 'callback' };
      return defaultConfig;
    }

    // If it's a string, treat as source path
    if (typeof input === 'string') {
      const config: ShellCompletionConfig = { source: input };
      return config;
    }

    // Otherwise it's already a config object
    return input;
  }

  /**
   * Checks if a tool configuration has any meaningful shell content.
   */
  hasEmissions(toolConfig: ToolConfig): boolean {
    const shellConfig = this.getShellConfig(toolConfig);
    if (!shellConfig) {
      return false;
    }

    return Boolean(
      shellConfig.environment && Object.keys(shellConfig.environment).length > 0 ||
        shellConfig.aliases && Object.keys(shellConfig.aliases).length > 0 ||
        shellConfig.functions && Object.keys(shellConfig.functions).length > 0 ||
        shellConfig.scripts && shellConfig.scripts.length > 0 ||
        shellConfig.completions,
    );
  }

  generateFileContent(toolEmissions: Map<string, Emission[]>): string {
    const result = this.renderContent(toolEmissions);
    return result.content;
  }

  getDefaultOutputPath(): string {
    return path.join(this.projectConfig.paths.shellScriptsDir, `main${this.fileExtension}`);
  }

  getAdditionalFiles(toolEmissions: Map<string, Emission[]>): IAdditionalShellFile[] {
    const result = this.renderContent(toolEmissions);
    return result.onceScripts.map((onceScript) => ({
      content: onceScript.content,
      outputPath: path.join(this.projectConfig.paths.shellScriptsDir, '.once', onceScript.filename),
    }));
  }

  /**
   * Creates the formatter configuration for this generator.
   */
  private createFormatterConfig(): FormatterConfig {
    return {
      onceScriptDir: path.join(this.projectConfig.paths.shellScriptsDir, '.once'),
    };
  }

  /**
   * Renders tool emissions to shell output using the emissions system.
   */
  private renderContent(toolEmissions: Map<string, Emission[]>): RenderedOutput {
    const formatterConfig = this.createFormatterConfig();
    const formatter = createEmissionFormatter(this.shellType, formatterConfig);
    const renderer = new BlockRenderer();

    // Build block structure with sections
    const blockBuilder = new BlockBuilder()
      .addSection('header', {
        priority: SectionPriority.FileHeader,
        isFileHeader: true,
        metadata: { sourceFile: this.projectConfig.paths.dotfilesDir },
      })
      .addSection('path', {
        title: 'PATH Modifications',
        priority: SectionPriority.Path,
        hoistKinds: ['path'],
      })
      .addSection('environment', {
        title: 'Environment Variables',
        priority: SectionPriority.Environment,
        hoistKinds: ['environment'],
      })
      .addSection('main', {
        title: 'Tool-Specific Initializations',
        priority: SectionPriority.MainContent,
        allowChildren: true,
      })
      .addSection('completions', {
        title: 'Shell Completions Setup',
        priority: SectionPriority.Completions,
        hoistKinds: ['completion'],
      })
      .addSection('footer', {
        priority: SectionPriority.FileFooter,
        isFileFooter: true,
      });

    // Add default PATH emission for target bin directory (priority -1 ensures it comes first)
    const defaultPathEmission = withPriority(
      pathEmission(this.projectConfig.paths.targetDir, { deduplicate: true }),
      -1,
    );
    blockBuilder.addEmission(defaultPathEmission);

    // Add each tool's emissions to the builder
    for (const [toolName, emissions] of toolEmissions) {
      for (const emission of emissions) {
        blockBuilder.addEmission(emission, toolName);
      }
    }

    const blocks = blockBuilder.build();
    return renderer.render(blocks, formatter);
  }
}
