// Example Cargo tool configurations

import path from 'node:path';
import type { CargoToolConfig } from '@dotfiles/installer-cargo';

// 1. Using cargo-quickinstall (fastest, most common)
export const ezaConfig: CargoToolConfig = {
  name: 'eza',
  version: 'latest',
  binaries: ['eza'],
  installationMethod: 'cargo',
  installParams: {
    crateName: 'eza',
    binarySource: 'cargo-quickinstall',
    versionSource: 'cargo-toml',
    githubRepo: 'eza-community/eza',
  },
};

// 2. Using GitHub releases with custom asset pattern
export const ripgrepConfig: CargoToolConfig = {
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

// 3. Using crates.io API for version detection
export const fdConfig: CargoToolConfig = {
  name: 'fd',
  version: 'latest',
  binaries: ['fd'],
  installationMethod: 'cargo',
  installParams: {
    crateName: 'fd-find', // Different crate name than binary name
    binarySource: 'cargo-quickinstall',
    versionSource: 'crates-io',
    customBinaries: ['fd'], // Override binary name
  },
};

// 4. Complex example with hooks
export const batConfig: CargoToolConfig = {
  name: 'bat',
  version: 'latest',
  binaries: ['bat'],
  installationMethod: 'cargo',
  installParams: {
    crateName: 'bat',
    binarySource: 'cargo-quickinstall',
    versionSource: 'cargo-toml',
    githubRepo: 'sharkdp/bat',
    hooks: {
      afterInstall: async (context) => {
        // Create config directory
        const configDir = path.join(context.installDir, 'config');
        await context.fileSystem.ensureDir(configDir);

        // Create default config
        const configPath = path.join(configDir, 'config');
        await context.fileSystem.writeFile(
          configPath,
          '--theme="Monokai Extended"\n--style="numbers,changes,header"\n'
        );
      },
    },
  },
};

// 5. Tool with multiple binaries
export const cargoEditConfig: CargoToolConfig = {
  name: 'cargo-edit',
  version: 'latest',
  binaries: ['cargo-add', 'cargo-rm', 'cargo-upgrade'],
  installationMethod: 'cargo',
  installParams: {
    crateName: 'cargo-edit',
    binarySource: 'cargo-quickinstall',
    versionSource: 'crates-io',
    customBinaries: ['cargo-add', 'cargo-rm', 'cargo-upgrade'],
  },
};
