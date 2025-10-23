import type { IArchiveExtractor } from '@dotfiles/archive-extractor';
import type { IDownloader } from '@dotfiles/downloader';
import type { AsyncInstallHook, ToolConfig } from '@dotfiles/schemas';
import { BinarySetupStep, DownloadStep, ExtractStep, HookStep, type InstallationStep } from '../steps';
import type { HookExecutor } from './HookExecutor';

/**
 * Factory functions for creating common step combinations
 */

/**
 * Create a download step
 */
export function createDownloadStep(url: string, filename: string, downloader: IDownloader): DownloadStep {
  return new DownloadStep({ url, filename, downloader });
}

/**
 * Create an extract step
 */
export function createExtractStep(archiveExtractor: IArchiveExtractor): ExtractStep {
  return new ExtractStep({ archiveExtractor });
}

/**
 * Create a hook step
 */
export function createHookStep(
  hookType: 'afterDownload' | 'afterExtract' | 'beforeInstall' | 'afterInstall',
  hook: AsyncInstallHook,
  hookExecutor: HookExecutor
): HookStep {
  return new HookStep({ hookType, hook, hookExecutor });
}

/**
 * Create a binary setup step
 */
export function createBinarySetupStep(toolName: string, setupType: 'archive' | 'direct'): BinarySetupStep {
  return new BinarySetupStep({ toolName, setupType });
}

/**
 * Create steps for downloading and extracting an archive
 */
export function createArchiveSteps(
  url: string,
  filename: string,
  downloader: IDownloader,
  archiveExtractor: IArchiveExtractor
): InstallationStep[] {
  return [createDownloadStep(url, filename, downloader), createExtractStep(archiveExtractor)];
}

/**
 * Create steps for downloading a direct binary
 */
export function createDirectDownloadSteps(url: string, filename: string, downloader: IDownloader): InstallationStep[] {
  return [createDownloadStep(url, filename, downloader)];
}

/**
 * Create hook steps from tool configuration
 */
export function createHookSteps(toolConfig: ToolConfig, hookExecutor: HookExecutor): InstallationStep[] {
  const steps: InstallationStep[] = [];

  if (toolConfig.installParams?.hooks?.beforeInstall) {
    steps.push(createHookStep('beforeInstall', toolConfig.installParams.hooks.beforeInstall, hookExecutor));
  }

  if (toolConfig.installParams?.hooks?.afterDownload) {
    steps.push(createHookStep('afterDownload', toolConfig.installParams.hooks.afterDownload, hookExecutor));
  }

  if (toolConfig.installParams?.hooks?.afterExtract) {
    steps.push(createHookStep('afterExtract', toolConfig.installParams.hooks.afterExtract, hookExecutor));
  }

  if (toolConfig.installParams?.hooks?.afterInstall) {
    steps.push(createHookStep('afterInstall', toolConfig.installParams.hooks.afterInstall, hookExecutor));
  }

  return steps;
}

/**
 * Create a complete pipeline for archive-based installation
 */
export function createArchivePipeline(
  url: string,
  filename: string,
  toolName: string,
  toolConfig: ToolConfig,
  downloader: IDownloader,
  archiveExtractor: IArchiveExtractor,
  hookExecutor: HookExecutor
): InstallationStep[] {
  const steps: InstallationStep[] = [];

  // Add beforeInstall hook if present
  if (toolConfig.installParams?.hooks?.beforeInstall) {
    steps.push(createHookStep('beforeInstall', toolConfig.installParams.hooks.beforeInstall, hookExecutor));
  }

  // Download
  steps.push(createDownloadStep(url, filename, downloader));

  // Add afterDownload hook if present
  if (toolConfig.installParams?.hooks?.afterDownload) {
    steps.push(createHookStep('afterDownload', toolConfig.installParams.hooks.afterDownload, hookExecutor));
  }

  // Extract
  steps.push(createExtractStep(archiveExtractor));

  // Add afterExtract hook if present
  if (toolConfig.installParams?.hooks?.afterExtract) {
    steps.push(createHookStep('afterExtract', toolConfig.installParams.hooks.afterExtract, hookExecutor));
  }

  // Setup binaries
  steps.push(createBinarySetupStep(toolName, 'archive'));

  // Add afterInstall hook if present
  if (toolConfig.installParams?.hooks?.afterInstall) {
    steps.push(createHookStep('afterInstall', toolConfig.installParams.hooks.afterInstall, hookExecutor));
  }

  return steps;
}

/**
 * Create a complete pipeline for direct binary installation
 */
export function createDirectPipeline(
  url: string,
  filename: string,
  toolName: string,
  toolConfig: ToolConfig,
  downloader: IDownloader,
  hookExecutor: HookExecutor
): InstallationStep[] {
  const steps: InstallationStep[] = [];

  // Add beforeInstall hook if present
  if (toolConfig.installParams?.hooks?.beforeInstall) {
    steps.push(createHookStep('beforeInstall', toolConfig.installParams.hooks.beforeInstall, hookExecutor));
  }

  // Download
  steps.push(...createDirectDownloadSteps(url, filename, downloader));

  // Add afterDownload hook if present
  if (toolConfig.installParams?.hooks?.afterDownload) {
    steps.push(createHookStep('afterDownload', toolConfig.installParams.hooks.afterDownload, hookExecutor));
  }

  // Setup binaries
  steps.push(createBinarySetupStep(toolName, 'direct'));

  // Add afterInstall hook if present
  if (toolConfig.installParams?.hooks?.afterInstall) {
    steps.push(createHookStep('afterInstall', toolConfig.installParams.hooks.afterInstall, hookExecutor));
  }

  return steps;
}
