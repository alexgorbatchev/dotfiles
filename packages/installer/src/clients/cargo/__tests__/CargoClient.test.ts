import { describe, expect, test } from 'bun:test';
import { CargoClient } from '@dotfiles/installer/clients/cargo';
import { createMemFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { createMockYamlConfig } from '@dotfiles/testing-helpers';
import { dedentString } from '@dotfiles/utils';

describe('CargoClient', () => {
  test('should construct successfully', async () => {
    const { fs } = await createMemFileSystem();
    const logger = new TestLogger();
    await fs.ensureDir('/test');
    const config = await createMockYamlConfig({
      config: {},
      filePath: '/test/config.yaml',
      fileSystem: fs,
      logger,
      systemInfo: { platform: 'darwin', arch: 'arm64', homeDir: '/home/test' },
      env: {},
    });
    const mockDownloader = {
      download: async () => Buffer.from('{}'),
      registerStrategy: () => {},
      downloadToFile: async () => {},
    };

    const client = new CargoClient(logger, config, mockDownloader);
    expect(client).toBeDefined();
  });

  test('should fetch crate metadata from crates.io', async () => {
    const { fs } = await createMemFileSystem();
    const logger = new TestLogger();
    await fs.ensureDir('/test');
    const config = await createMockYamlConfig({
      config: {},
      filePath: '/test/config.yaml',
      fileSystem: fs,
      logger,
      systemInfo: { platform: 'darwin', arch: 'arm64', homeDir: '/home/test' },
      env: {},
    });
    const mockDownloader = {
      download: async () =>
        Buffer.from(
          JSON.stringify({
            crate: {
              name: 'eza',
              newest_version: '0.23.1',
            },
            versions: [
              {
                num: '0.23.1',
                bin_names: ['eza'],
              },
            ],
          })
        ),
      registerStrategy: () => {},
      downloadToFile: async () => {},
    };

    const client = new CargoClient(logger, config, mockDownloader);
    const metadata = await client.getCrateMetadata('eza');

    expect(metadata).toEqual({
      crate: {
        name: 'eza',
        newest_version: '0.23.1',
      },
      versions: [
        {
          num: '0.23.1',
          bin_names: ['eza'],
        },
      ],
    });
  });

  test('should get latest version from crates.io', async () => {
    const { fs } = await createMemFileSystem();
    const logger = new TestLogger();
    await fs.ensureDir('/test');
    const config = await createMockYamlConfig({
      config: {},
      filePath: '/test/config.yaml',
      fileSystem: fs,
      logger,
      systemInfo: { platform: 'darwin', arch: 'arm64', homeDir: '/home/test' },
      env: {},
    });
    const mockDownloader = {
      download: async () =>
        Buffer.from(
          JSON.stringify({
            crate: {
              name: 'eza',
              newest_version: '0.23.1',
            },
            versions: [],
          })
        ),
      registerStrategy: () => {},
      downloadToFile: async () => {},
    };

    const client = new CargoClient(logger, config, mockDownloader);
    const version = await client.getLatestVersion('eza');

    expect(version).toBe('0.23.1');
  });

  test('should parse Cargo.toml with additional fields', async () => {
    const { fs } = await createMemFileSystem();
    const logger = new TestLogger();
    await fs.ensureDir('/test');
    const config = await createMockYamlConfig({
      config: {},
      filePath: '/test/config.yaml',
      fileSystem: fs,
      logger,
      systemInfo: { platform: 'darwin', arch: 'arm64', homeDir: '/home/test' },
      env: {},
    });

    // Mock a realistic Cargo.toml with many additional fields
    const cargoTomlContent = dedentString(`
      [package]
      name = "eza"
      version = "0.18.2"
      edition = "2021"
      description = "A modern, maintained replacement for ls"
      authors = ["Christina Sørensen <christina@cafkafk.com>"]
      license = "MIT"
      repository = "https://github.com/eza-community/eza"
      homepage = "https://eza.rocks"
      readme = "README.md"
      keywords = ["ls", "files", "command-line"]
      categories = ["command-line-utilities"]
      documentation = "https://docs.rs/eza"
      rust-version = "1.70.0"
      exclude = ["/.github", "/completions", "/man"]

      [dependencies]
      clap = { version = "4.4", features = ["derive", "wrap_help"] }
      chrono = { version = "0.4", default-features = false, features = ["clock", "std"] }
      nu-ansi-term = "0.49.0"
      log = "0.4"
      users = "0.11.0"

      [dev-dependencies]
      criterion = "0.5"

      [[bin]]
      name = "eza"
      path = "src/main.rs"

      [profile.release]
      lto = true
      panic = "abort"
      codegen-units = 1

      [workspace]
      members = [".", "eza-derive"]
    `);

    const mockDownloader = {
      download: async () => Buffer.from(cargoTomlContent),
      registerStrategy: () => {},
      downloadToFile: async () => {},
    };

    const client = new CargoClient(logger, config, mockDownloader);
    const packageInfo = await client.getCargoTomlPackage('https://example.com/Cargo.toml');

    expect(packageInfo).toEqual({
      name: 'eza',
      version: '0.18.2',
      edition: '2021',
      description: 'A modern, maintained replacement for ls',
      authors: ['Christina Sørensen <christina@cafkafk.com>'],
      license: 'MIT',
      repository: 'https://github.com/eza-community/eza',
      homepage: 'https://eza.rocks',
    });
  });

  test('should handle Cargo.toml with workspace configuration', async () => {
    const { fs } = await createMemFileSystem();
    const logger = new TestLogger();
    await fs.ensureDir('/test');
    const config = await createMockYamlConfig({
      config: {},
      filePath: '/test/config.yaml',
      fileSystem: fs,
      logger,
      systemInfo: { platform: 'darwin', arch: 'arm64', homeDir: '/home/test' },
      env: {},
    });

    // Mock a Cargo.toml with workspace and other complex sections
    const cargoTomlContent = dedentString(`
      [workspace]
      members = ["crates/*"]
      resolver = "2"

      [package]
      name = "complex-tool"
      version = "1.2.3"
      edition = "2021"
      description = "A complex tool with workspace"
      authors = ["Test Author <test@example.com>"]
      license = "MIT OR Apache-2.0"
      repository = "https://github.com/example/complex-tool"
      documentation = "https://docs.rs/complex-tool"
      readme = "README.md"
      keywords = ["cli", "tool"]
      categories = ["command-line-utilities"]
      build = "build.rs"

      [features]
      default = ["feature1"]
      feature1 = []
      feature2 = ["dep:optional-dep"]

      [dependencies]
      clap = { version = "4.0", features = ["derive"] }
      serde = { version = "1.0", features = ["derive"] }
      tokio = { version = "1.0", features = ["full"] }

      [dev-dependencies]
      criterion = "0.5"
      tempfile = "3.0"

      [build-dependencies]
      cc = "1.0"

      [[bin]]
      name = "complex-tool"
      path = "src/main.rs"

      [[bin]]
      name = "helper-tool"
      path = "src/bin/helper.rs"

      [profile.release]
      lto = true
      codegen-units = 1
      panic = "abort"
      strip = true
    `);

    const mockDownloader = {
      download: async () => Buffer.from(cargoTomlContent),
      registerStrategy: () => {},
      downloadToFile: async () => {},
    };

    const client = new CargoClient(logger, config, mockDownloader);
    const packageInfo = await client.getCargoTomlPackage('https://example.com/Cargo.toml');

    expect(packageInfo).toEqual({
      name: 'complex-tool',
      version: '1.2.3',
      edition: '2021',
      description: 'A complex tool with workspace',
      authors: ['Test Author <test@example.com>'],
      license: 'MIT OR Apache-2.0',
      repository: 'https://github.com/example/complex-tool',
    });
  });
});
