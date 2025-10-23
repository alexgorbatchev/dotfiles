import path from 'node:path';
import type { ShellCompletionConfig, ShellType, ToolConfig } from '@dotfiles/schemas';
import type { CompletionGenerationContext, CompletionGenerator } from '@dotfiles/shell-init-generator';
import { installerLogMessages } from '../utils/log-messages';
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
      context.logger.debug(installerLogMessages.completion.noCompletionsConfigured());
      return context;
    }

    context.logger.debug(installerLogMessages.completion.generatingCompletions(completionConfigs.length));

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

    context.logger.debug(installerLogMessages.completion.generatedCompletion(generated.filename, generated.targetPath));
  }

  private extractCompletionConfigs(
    toolConfig: ToolConfig
  ): Array<{ shellType: ShellType; config: import('@dotfiles/schemas').ShellCompletionConfig }> {
    const configs: Array<{ shellType: ShellType; config: import('@dotfiles/schemas').ShellCompletionConfig }> = [];

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
