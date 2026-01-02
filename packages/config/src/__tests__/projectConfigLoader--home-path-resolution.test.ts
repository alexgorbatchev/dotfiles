import { beforeEach, describe, expect, it } from 'bun:test';
import { Architecture, type ISystemInfo, Platform } from '@dotfiles/core';
import { createMemFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { createProjectConfigFromObject } from '../stagedProjectConfigLoader';

describe('projectConfigLoader - staged home/path resolution', () => {
  const bootstrapSystemInfo: ISystemInfo = {
    platform: Platform.MacOS,
    arch: Architecture.Arm64,
    homeDir: '/bootstrap-home',
  };

  const userConfigPath: string = '/config-dir/dotfiles.config.yaml';

  let logger: TestLogger;

  beforeEach(() => {
    logger = new TestLogger({ name: 'test' });
  });

  it('bootstraps paths.homeDir ~ using bootstrap home', async () => {
    const { fs } = await createMemFileSystem({ initialVolumeJson: {} });

    const result = await createProjectConfigFromObject(
      logger,
      fs,
      {
        paths: {
          homeDir: '~/configured',
        },
      },
      bootstrapSystemInfo,
      {},
      { userConfigPath }
    );

    expect(result.paths.homeDir).toBe('/bootstrap-home/configured');
  });

  it('expands ~ in config.paths.* against configured home, not config file dir', async () => {
    const { fs } = await createMemFileSystem({ initialVolumeJson: {} });

    const result = await createProjectConfigFromObject(
      logger,
      fs,
      {
        paths: {
          homeDir: '/configured-home',
          dotfilesDir: '~/dotfiles',
        },
      },
      bootstrapSystemInfo,
      {},
      { userConfigPath }
    );

    expect(result.paths.dotfilesDir).toBe('/configured-home/dotfiles');
  });

  it('resolves {HOME} to configured home after paths.homeDir is established', async () => {
    const { fs } = await createMemFileSystem({ initialVolumeJson: {} });

    const result = await createProjectConfigFromObject(
      logger,
      fs,
      {
        paths: {
          homeDir: '/configured-home',
          targetDir: '{HOME}/bin',
        },
      },
      bootstrapSystemInfo,
      {},
      { userConfigPath }
    );

    expect(result.paths.targetDir).toBe('/configured-home/bin');
  });

  it('does not expand ~ outside config.paths subtree', async () => {
    const { fs } = await createMemFileSystem({ initialVolumeJson: {} });

    const result = await createProjectConfigFromObject(
      logger,
      fs,
      {
        logging: {
          debug: '~/should-not-expand',
        },
      },
      bootstrapSystemInfo,
      {},
      { userConfigPath }
    );

    expect(result.logging.debug).toBe('~/should-not-expand');
  });

  it('expands ~\\ prefix as home (PowerShell/Windows separator support)', async () => {
    const { fs } = await createMemFileSystem({ initialVolumeJson: {} });

    const result = await createProjectConfigFromObject(
      logger,
      fs,
      {
        paths: {
          homeDir: '/configured-home',
          dotfilesDir: '~\\dotfiles',
        },
      },
      bootstrapSystemInfo,
      {},
      { userConfigPath }
    );

    expect(result.paths.dotfilesDir).toBe('/configured-home\\dotfiles');
  });

  it('does not expand ~user/... forms (unsupported)', async () => {
    const { fs } = await createMemFileSystem({ initialVolumeJson: {} });

    expect(
      createProjectConfigFromObject(
        logger,
        fs,
        {
          paths: {
            homeDir: '/configured-home',
            dotfilesDir: '~other/dotfiles',
          },
        },
        bootstrapSystemInfo,
        {},
        { userConfigPath }
      )
    ).rejects.toThrow('unsupported tilde');
  });
});
