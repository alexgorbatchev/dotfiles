import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import assert from 'node:assert';
import type { CargoToolConfig } from '@dotfiles/schemas';
import { FetchMockHelper } from '@dotfiles/testing-helpers';
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

    // Mock cargoClient methods
    setup.mocks.cargoClient.buildCargoTomlUrl.mockReturnValueOnce(
      'https://raw.githubusercontent.com/eza-community/eza/main/Cargo.toml'
    );
    setup.mocks.cargoClient.getCargoTomlPackage.mockResolvedValueOnce({
      name: 'eza',
      version: '0.18.2',
    });

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
    expect(setup.mocks.cargoClient.buildCargoTomlUrl).toHaveBeenCalledWith('eza-community/eza');
    expect(setup.mocks.cargoClient.getCargoTomlPackage).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/eza-community/eza/main/Cargo.toml'
    );
    expect(result.metadata?.method).toBe('cargo');
    if (result.metadata?.method === 'cargo') {
      expect(result.metadata.binarySource).toBe('cargo-quickinstall');
    }
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

    // Mock cargoClient to return version from crates.io
    setup.mocks.cargoClient.getLatestVersion.mockResolvedValueOnce('14.1.1');

    const result = await setup.installer.install('ripgrep', toolConfig);

    expect(result.success).toBe(true);
    assert(result.success);
    expect(result.binaryPaths).toHaveLength(1);
    expect(result.version).toBe('14.1.1');
    expect(result.metadata?.method).toBe('cargo');
    if (result.metadata?.method === 'cargo') {
      expect(result.metadata.binarySource).toBe('github-releases');
    }
    expect(setup.mocks.cargoClient.getLatestVersion).toHaveBeenCalledWith('ripgrep');
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

    // Mock cargoClient to return version from crates.io
    setup.mocks.cargoClient.getLatestVersion.mockResolvedValueOnce('8.7.0');

    const result = await setup.installer.install('fd', toolConfig);

    expect(result.success).toBe(true);
    assert(result.success);
    // The download URL should contain the correct platform/arch mapping
    expect(result.metadata?.method).toBe('cargo');
    if (result.metadata?.method === 'cargo') {
      expect(result.metadata.downloadUrl).toContain('aarch64-apple-darwin');
    }
    expect(setup.mocks.cargoClient.getLatestVersion).toHaveBeenCalledWith('fd-find');
  });
});
