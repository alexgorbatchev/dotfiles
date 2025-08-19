import path from 'node:path';
import type { CompletionGenerationContext, CompletionGenerator } from '@modules/generator-shell-init';
import { logs } from '@modules/logger';
import type { ShellCompletionConfig, ShellType, ToolConfig } from '@types';
import { InstallationStep, type StepContext } from './base';

export interface CompletionGenerationStepParams {
  completionGenerator: CompletionGenerator;
}

export class CompletionGenerationStep extends InstallationStep<CompletionGenerationStepParams> {
  getStepName(): string {
    return 'completion-generation';
  }

  async execute(context: StepContext): Promise<StepContext> {
    const completionConfigs = this.extractCompletionConfigs(context.toolConfig);

    if (completionConfigs.length === 0) {
      context.logger.debug(logs.command.debug.installDebug('no completions configured'));
      return context;
    }

    context.logger.debug(logs.command.debug.installDebug(`generating ${completionConfigs.length} completion files`));

    const generationContext: CompletionGenerationContext = {
      toolName: context.toolName,
      toolInstallDir: context.installDir,
      shellScriptsDir: context.appConfig.paths.shellScriptsDir,
      homeDir: context.appConfig.paths.homeDir,
    };

    try {
      for (const { shellType, config } of completionConfigs) {
        if (config.cmd) {
          await this.generateAndInstallCompletion(config, shellType, generationContext, context);
        }
      }

      return context;
    } catch (error: unknown) {
      return {
        ...context,
        success: false,
        error: `Completion generation failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async generateAndInstallCompletion(
    config: ShellCompletionConfig,
    shellType: ShellType,
    generationContext: CompletionGenerationContext,
    context: StepContext
  ): Promise<void> {
    const generated = await this.params.completionGenerator.generateCompletionFile(
      config,
      generationContext.toolName,
      shellType,
      generationContext
    );

    await context.toolFs.mkdir(path.dirname(generated.targetPath), { recursive: true });
    await context.toolFs.writeFile(generated.targetPath, generated.content);

    context.logger.debug(
      logs.command.debug.installDebug(`generated completion: ${generated.filename} -> ${generated.targetPath}`)
    );
  }

  private extractCompletionConfigs(
    toolConfig: ToolConfig
  ): Array<{ shellType: ShellType; config: import('@types').ShellCompletionConfig }> {
    const configs: Array<{ shellType: ShellType; config: import('@types').ShellCompletionConfig }> = [];

    if (toolConfig.shellConfigs?.zsh?.completions) {
      configs.push({ shellType: 'zsh', config: toolConfig.shellConfigs.zsh.completions });
    }
    if (toolConfig.shellConfigs?.bash?.completions) {
      configs.push({ shellType: 'bash', config: toolConfig.shellConfigs.bash.completions });
    }
    if (toolConfig.shellConfigs?.powershell?.completions) {
      configs.push({ shellType: 'powershell', config: toolConfig.shellConfigs.powershell.completions });
    }

    return configs;
  }
}
