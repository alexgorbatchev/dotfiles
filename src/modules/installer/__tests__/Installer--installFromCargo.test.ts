import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { FetchMockHelper } from '@testing-helpers';
import type { CargoToolConfig } from '@types';
import { createInstallerTestSetup } from './installer-test-helpers';

describe('Installer - installFromCargo', () => {
  const fetchMockHelper = new FetchMockHelper();

  beforeEach(() => {
    fetchMockHelper.setup();
  });

  afterEach(() => {
    fetchMockHelper.restore();
  });

  it('should install tool from cargo-quickinstall', async () => {
    const setup = await createInstallerTestSetup();

    // Mock fetch for Cargo.toml
    fetchMockHelper.mockTextResponseOnce(`[package]\nname = "eza"\nversion = "0.18.2"\n`);

    const toolConfig: CargoToolConfig = {
      name: 'eza',
      version: 'latest',
      binaries: ['eza'],
      installationMethod: 'cargo',
      installParams: {
        crateName: 'eza',
        githubRepo: 'eza-community/eza',
      },
    };

    const result = await setup.installer.install('eza', toolConfig);

    if (!result.success) {
      throw new Error(`Installation failed: ${result.error}`);
    }

    expect(result.success).toBe(true);
    expect(result.binaryPaths).toHaveLength(1);
    expect(result.version).toBe('0.18.2');
    expect(result.info?.['binarySource']).toBe('cargo-quickinstall');
  });

  it('should install tool from GitHub releases', async () => {
    const setup = await createInstallerTestSetup();

    const toolConfig: CargoToolConfig = {
      name: 'ripgrep',
      version: 'latest',
      binaries: ['rg'],
      installationMethod: 'cargo',
      installParams: {
        crateName: 'ripgrep',
        binarySource: 'github-releases',
        versionSource: 'crates-io',
        githubRepo: 'BurntSushi/ripgrep',
        assetPattern: 'ripgrep-{version}-{arch}-{platform}.tar.gz',
      },
    };

    // Mock crates.io API
    fetchMockHelper.mockJsonResponseOnce({
      crate: {
        name: 'ripgrep',
        newest_version: '14.1.1',
      },
    });

    const result = await setup.installer.install('ripgrep', toolConfig);

    expect(result.success).toBe(true);
    expect(result.binaryPaths).toHaveLength(1);
    expect(result.version).toBe('14.1.1');
    expect(result.info?.['binarySource']).toBe('github-releases');
  });

  it('should handle platform/arch mapping correctly', async () => {
    const setup = await createInstallerTestSetup();

    const toolConfig: CargoToolConfig = {
      name: 'fd',
      version: 'latest',
      binaries: ['fd'],
      installationMethod: 'cargo',
      installParams: {
        crateName: 'fd-find',
        versionSource: 'crates-io',
      },
    };

    // Mock crates.io API
    fetchMockHelper.mockJsonResponseOnce({
      crate: {
        name: 'fd-find',
        newest_version: '8.7.0',
      },
    });

    const result = await setup.installer.install('fd', toolConfig);

    expect(result.success).toBe(true);
    // The download URL should contain the correct platform/arch mapping
    expect(result.info?.['downloadUrl']).toContain('aarch64-apple-darwin');
  });
});
