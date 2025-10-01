import { beforeEach, describe, expect, it } from 'bun:test';
import {
  createCargoToolConfig,
  createInstallerTestSetup,
  type InstallerTestSetup,
  MOCK_TOOL_NAME,
} from './installer-test-helpers';

describe('Installer - Cargo Version Check', () => {
  let setup: InstallerTestSetup;

  beforeEach(async () => {
    setup = await createInstallerTestSetup();
  });

  it('should skip reinstallation when cargo tool with latest version is already installed', async () => {
    // Create a cargo tool config with version 'latest'
    const toolConfig = createCargoToolConfig({
      version: 'latest',
      installParams: {
        crateName: 'eza',
        binarySource: 'cargo-quickinstall',
        versionSource: 'cargo-toml',
        githubRepo: 'eza-community/eza',
      },
    });

    // Mock that the tool is already installed with version '0.18.2'
    setup.mockToolInstallationRegistry.getToolInstallation.mockResolvedValue({
      id: 1,
      toolName: MOCK_TOOL_NAME,
      version: '0.18.2',
      installPath: '/existing/install/path',
      timestamp: '2024-01-01-12-00-00',
      installedAt: Date.now(),
      binaryPaths: ['/existing/binary/path'],
    });

    // Mock cargoClient to return the same version as already installed
    setup.mocks.cargoClient.buildCargoTomlUrl.mockReturnValue(
      'https://raw.githubusercontent.com/eza-community/eza/main/Cargo.toml'
    );
    setup.mocks.cargoClient.getCargoTomlPackage.mockResolvedValue({
      name: 'eza',
      version: '0.18.2',
    });

    // Install the tool
    const result = await setup.installer.install(MOCK_TOOL_NAME, toolConfig);

    // Should return early with already-installed result instead of downloading again
    expect(result.success).toBe(true);
    expect(result.message).toContain('already installed');
    expect(result.installPath).toBe('/existing/install/path');
    expect(result.version).toBe('0.18.2');

    // Should not have called the downloader since it should skip installation
    expect(setup.mockDownloader.download).not.toHaveBeenCalled();
    expect(setup.mocks.cargoClient.buildCargoTomlUrl).toHaveBeenCalledWith('eza-community/eza');
    expect(setup.mocks.cargoClient.getCargoTomlPackage).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/eza-community/eza/main/Cargo.toml'
    );
  });

  it('should proceed with installation when cargo tool has different version than installed', async () => {
    // Create a cargo tool config with version 'latest'
    const toolConfig = createCargoToolConfig({
      version: 'latest',
      installParams: {
        crateName: 'eza',
        binarySource: 'cargo-quickinstall',
        versionSource: 'cargo-toml',
        githubRepo: 'eza-community/eza',
      },
    });

    // Mock that the tool is already installed with version '0.18.1' (older)
    setup.mockToolInstallationRegistry.getToolInstallation.mockResolvedValue({
      id: 1,
      toolName: MOCK_TOOL_NAME,
      version: '0.18.1',
      installPath: '/existing/install/path',
      timestamp: '2024-01-01-12-00-00',
      installedAt: Date.now(),
      binaryPaths: ['/existing/binary/path'],
    });

    // Mock cargoClient to return a newer version
    setup.mocks.cargoClient.buildCargoTomlUrl.mockReturnValue(
      'https://raw.githubusercontent.com/eza-community/eza/main/Cargo.toml'
    );
    setup.mocks.cargoClient.getCargoTomlPackage.mockResolvedValue({
      name: 'eza',
      version: '0.18.2',
    });

    // Install the tool
    const result = await setup.installer.install(MOCK_TOOL_NAME, toolConfig);

    // Should proceed with installation since versions don't match
    expect(result.success).toBe(true);
    expect(result.version).toBe('0.18.2');

    // Should have called the downloader since it needs to install the new version
    expect(setup.mockDownloader.download).toHaveBeenCalled();
    expect(setup.mocks.cargoClient.buildCargoTomlUrl).toHaveBeenCalledWith('eza-community/eza');
    expect(setup.mocks.cargoClient.getCargoTomlPackage).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/eza-community/eza/main/Cargo.toml'
    );
  });
});
