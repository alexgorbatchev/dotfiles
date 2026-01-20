import type { ProjectConfig } from '@dotfiles/core';
import type { MockedInterface } from '@dotfiles/testing-helpers';
import { type IVersionChecker, VersionComparisonStatus } from '@dotfiles/version-checker';
import { mock } from 'bun:test';

/**
 * Creates a mock ProjectConfig with standard test paths.
 * Uses a simple object mock since dashboard tests only need path configuration.
 */
export function createMockProjectConfig(): ProjectConfig {
  return {
    paths: {
      dotfilesDir: '/home/user/.dotfiles',
      generatedDir: '/home/user/.dotfiles/.generated',
      binariesDir: '/home/user/.dotfiles/.generated/binaries',
      targetDir: '/home/user/.dotfiles/.generated/bin-default',
      toolConfigsDir: '/home/user/.dotfiles/tools',
      homeDir: '/home/user',
      shellScriptsDir: '/home/user/.dotfiles/.generated/shell-scripts',
    },
  } as ProjectConfig;
}

/**
 * Creates a mock IVersionChecker with standard test behavior.
 */
export function createMockVersionChecker(): MockedInterface<IVersionChecker> {
  return {
    getLatestToolVersion: mock(async (_owner: string, _repo: string) => '1.0.0'),
    checkVersionStatus: mock(
      async (_currentVersion: string, _latestVersion: string) => VersionComparisonStatus.UP_TO_DATE,
    ),
  };
}
