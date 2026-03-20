import type { ProjectConfig } from '@dotfiles/config';
import type { IInstallContext, ToolConfig } from '@dotfiles/core';
import type { TsLogger } from '@dotfiles/logger';
import type { TrackedFileSystem } from '@dotfiles/registry/file';
import type { IToolInstallationRegistry } from '@dotfiles/registry/tool';
import type { ISymlinkGenerator } from '@dotfiles/symlink-generator';
import path from 'node:path';
import type { InstallResult } from '../types';
import { messages } from '../utils';

type UnknownRecord = Record<string, unknown>;

function isUnknownRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getPluginMetadataRecord(result: InstallResult): UnknownRecord {
  const emptyMetadata: UnknownRecord = {};

  if (!result.success) {
    return emptyMetadata;
  }

  if (!('metadata' in result)) {
    return emptyMetadata;
  }

  const metadata: unknown = result.metadata;
  if (!isUnknownRecord(metadata)) {
    return emptyMetadata;
  }

  const { method, ...rest } = metadata;
  if (typeof method === 'string') {
    return { ...rest, installMethod: method };
  }

  return metadata;
}

interface IInstallationStateWriterDependencies {
  projectConfig: ProjectConfig;
  toolInstallationRegistry: IToolInstallationRegistry;
  symlinkGenerator: ISymlinkGenerator;
}

export class InstallationStateWriter {
  private readonly projectConfig: ProjectConfig;
  private readonly toolInstallationRegistry: IToolInstallationRegistry;
  private readonly symlinkGenerator: ISymlinkGenerator;

  constructor(dependencies: IInstallationStateWriterDependencies) {
    this.projectConfig = dependencies.projectConfig;
    this.toolInstallationRegistry = dependencies.toolInstallationRegistry;
    this.symlinkGenerator = dependencies.symlinkGenerator;
  }

  async recordInstallation(
    toolName: string,
    resolvedToolConfig: ToolConfig,
    installedDir: string,
    context: IInstallContext,
    result: InstallResult,
    parentLogger: TsLogger,
  ): Promise<void> {
    const logger = parentLogger.getSubLogger({ name: 'recordInstallation' });
    if (!result.success) {
      return;
    }

    try {
      const version: string = 'version' in result && result.version ? result.version : context.timestamp;

      const installParams: unknown = resolvedToolConfig.installParams;
      const configuredVersion: string | undefined = installParams &&
          typeof installParams === 'object' &&
          'version' in installParams &&
          typeof installParams.version === 'string'
        ? installParams.version
        : undefined;

      const originalTag: string | undefined = 'originalTag' in result && typeof result.originalTag === 'string'
        ? result.originalTag
        : undefined;

      await this.toolInstallationRegistry.recordToolInstallation({
        toolName,
        version,
        installPath: installedDir,
        timestamp: context.timestamp,
        binaryPaths: result.binaryPaths,
        configuredVersion,
        originalTag,
        ...getPluginMetadataRecord(result),
      });
      logger.debug(messages.outcome.installSuccess(toolName, version, 'registry-recorded'));
    } catch (error) {
      logger.error(messages.outcome.installFailed('registry-record'), error);
    }
  }

  async createBinaryEntrypoints(
    toolName: string,
    binaryPaths: string[],
    fs: TrackedFileSystem,
    parentLogger: TsLogger,
    installedDir: string,
    isExternallyManaged: boolean,
  ): Promise<void> {
    const logger = parentLogger.getSubLogger({ name: 'createBinaryEntrypoints' });
    const toolDir = path.join(this.projectConfig.paths.binariesDir, toolName);

    await fs.ensureDir(toolDir);

    if (isExternallyManaged) {
      const externalDir = path.join(toolDir, 'external');
      await fs.ensureDir(externalDir);

      for (const binaryPath of binaryPaths) {
        const binaryName = path.basename(binaryPath);
        const symlinkPath = path.join(externalDir, binaryName);

        try {
          await this.symlinkGenerator.createBinarySymlink(logger, binaryPath, symlinkPath);
        } catch (error) {
          logger.error(messages.lifecycle.externalBinaryMissing(toolName, binaryName, binaryPath));
          throw error;
        }
      }

      return;
    }

    for (const binaryPath of binaryPaths) {
      const binaryName = path.basename(binaryPath);
      const entrypointPath = path.join(installedDir, binaryName);

      if (binaryPath === entrypointPath) {
        continue;
      }

      try {
        if (await fs.exists(entrypointPath)) {
          await fs.rm(entrypointPath, { force: true });
        }
      } catch (error) {
        logger.error(messages.binarySymlink.removeExistingFailed(entrypointPath), error);
        throw error;
      }

      try {
        await fs.copyFile(binaryPath, entrypointPath);

        const binaryStats = await fs.stat(binaryPath);
        const binaryMode: number = binaryStats.mode & 0o777;
        await fs.chmod(entrypointPath, binaryMode);
      } catch (error) {
        logger.error(messages.binarySymlink.creationFailed(entrypointPath, binaryPath), error);
        throw error;
      }
    }
  }

  async updateCurrentSymlink(
    toolName: string,
    fs: TrackedFileSystem,
    parentLogger: TsLogger,
    installedDir: string,
    isExternallyManaged: boolean,
  ): Promise<void> {
    const logger = parentLogger.getSubLogger({ name: 'updateCurrentSymlink' });
    const toolDir = path.join(this.projectConfig.paths.binariesDir, toolName);
    const currentSymlinkPath = path.join(toolDir, 'current');

    await fs.ensureDir(toolDir);

    const currentTarget: string = isExternallyManaged ? 'external' : path.basename(installedDir);

    try {
      if (await fs.exists(currentSymlinkPath)) {
        await fs.rm(currentSymlinkPath, { force: true, recursive: true });
      }
    } catch (error) {
      logger.error(messages.lifecycle.removingExistingSymlink(currentSymlinkPath), error);
      throw error;
    }

    try {
      const symlinkFs = fs.withFileType('symlink');
      await symlinkFs.symlink(currentTarget, currentSymlinkPath, 'dir');
    } catch (error) {
      logger.error(messages.lifecycle.creatingExternalSymlink(currentSymlinkPath, currentTarget), error);
      throw error;
    }

    try {
      const linkTarget = await fs.readlink(currentSymlinkPath);
      if (linkTarget !== currentTarget) {
        logger.error(messages.lifecycle.symlinkVerificationFailed(currentSymlinkPath));
        throw new Error(
          `Symlink verification failed: ${currentSymlinkPath} points to ${linkTarget}, expected ${currentTarget}`,
        );
      }
    } catch (error) {
      logger.error(messages.lifecycle.symlinkVerificationFailed(currentSymlinkPath), error);
      throw error;
    }
  }
}
