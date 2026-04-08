/**
 * Builder for configuring mock server endpoints.
 *
 * Provides a fluent API for declaring what endpoints the mock server should serve
 * for each test. No side effects - configuration is explicit per test.
 */
import type {
  IBinaryConfig,
  ICargoToolConfig,
  IGiteaToolConfig,
  IGitHubToolConfig,
  IMockServerConfig,
  IScriptConfig,
  ITarConfig,
} from "./types";

/**
 * Builder for configuring a mock server for e2e tests.
 *
 * @example
 * ```typescript
 * withMockServer((builder) => builder
 *   .withGitHubTool({
 *     repo: 'repo/github-release-tool',
 *     toolDir: 'tools/github-release-tool',
 *     defaultVersion: '1.0.0',
 *     versions: [{ version: '1.0.0', assets: { 'macos.*arm64': 'tool-1.0.0-macos_arm64.tar.gz' } }]
 *   })
 *   .withScript('/mock-install.sh', 'tools/my-tool/mock-install.sh')
 * );
 * ```
 */
export class MockServerBuilder {
  private readonly _fixtureDir: string;
  private readonly _githubTools: IGitHubToolConfig[] = [];
  private readonly _giteaTools: IGiteaToolConfig[] = [];
  private readonly _cargoTools: ICargoToolConfig[] = [];
  private readonly _scripts: IScriptConfig[] = [];
  private readonly _tarballs: ITarConfig[] = [];
  private readonly _binaries: IBinaryConfig[] = [];

  constructor(fixtureDir: string) {
    this._fixtureDir = fixtureDir;
  }

  /**
   * Adds a GitHub release tool mock.
   */
  withGitHubTool(config: IGitHubToolConfig): MockServerBuilder {
    this._githubTools.push(config);
    return this;
  }

  /**
   * Adds a Gitea/Forgejo release tool mock.
   */
  withGiteaTool(config: IGiteaToolConfig): MockServerBuilder {
    this._giteaTools.push(config);
    return this;
  }

  /**
   * Adds a Cargo crate tool mock.
   */
  withCargoTool(config: ICargoToolConfig): MockServerBuilder {
    this._cargoTools.push(config);
    return this;
  }

  /**
   * Adds a script endpoint mock.
   */
  withScript(path: string, fixturePath: string, contentType?: string): MockServerBuilder {
    this._scripts.push({ path, fixturePath, contentType });
    return this;
  }

  /**
   * Adds a tarball endpoint mock.
   */
  withTarball(path: string, fixturePath: string): MockServerBuilder {
    this._tarballs.push({ path, fixturePath });
    return this;
  }

  /**
   * Adds a binary file endpoint mock.
   */
  withBinary(path: string, fixturePath: string): MockServerBuilder {
    this._binaries.push({ path, fixturePath });
    return this;
  }

  /**
   * Builds the mock server configuration.
   */
  build(): IMockServerConfig {
    return {
      fixtureDir: this._fixtureDir,
      githubTools: this._githubTools,
      giteaTools: this._giteaTools,
      cargoTools: this._cargoTools,
      scripts: this._scripts,
      tarballs: this._tarballs,
      binaries: this._binaries,
    };
  }
}

// ============================================================================
// Pre-configured tool configurations for reuse
// ============================================================================

/**
 * GitHub Release Tool - used by generate, install, update, conflict tests.
 */
export const GITHUB_RELEASE_TOOL: IGitHubToolConfig = {
  repo: "repo/github-release-tool",
  toolDir: "tools/github-release-tool",
  defaultVersion: "1.0.0",
  versions: [
    {
      version: "1.0.0",
      assets: {
        "macos.*arm64": "github-release-tool-1.0.0-macos_arm64.tar.gz",
        "linux.*(x86_64|amd64)": "github-release-tool-1.0.0-linux_amd64.tar.gz",
      },
    },
    {
      version: "2.0.0",
      assets: {
        "macos.*arm64": "github-release-tool-2.0.0-macos_arm64.tar.gz",
        "linux.*(x86_64|amd64)": "github-release-tool-2.0.0-linux_amd64.tar.gz",
      },
    },
  ],
};

/**
 * Hook Test Tool - used by hook tests.
 */
export const HOOK_TEST_TOOL: IGitHubToolConfig = {
  repo: "repo/hook-test-tool",
  toolDir: "tools/hook-test-tool",
  defaultVersion: "1.0.0",
  versions: [
    {
      version: "1.0.0",
      assets: {
        "macos.*arm64": "hook-test-tool-1.0.0-macos_arm64.tar.gz",
        "linux.*(x86_64|amd64)": "hook-test-tool-1.0.0-linux_amd64.tar.gz",
      },
    },
  ],
};

/**
 * Install By Binary Tool - used by install tests.
 */
export const INSTALL_BY_BINARY_TOOL: IGitHubToolConfig = {
  repo: "repo/install-by-binary-tool",
  toolDir: "tools/install-by-binary-tool",
  defaultVersion: "1.0.0",
  versions: [
    {
      version: "1.0.0",
      assets: {
        "macos.*arm64": "install-by-binary-tool-1.0.0-macos_arm64.tar.gz",
        "linux.*(x86_64|amd64)": "install-by-binary-tool-1.0.0-linux_amd64.tar.gz",
      },
    },
  ],
};

/**
 * Auto Install Tool - used by auto-install tests.
 */
export const AUTO_INSTALL_TOOL: IGitHubToolConfig = {
  repo: "repo/auto-install-tool",
  toolDir: "tools/auto-install-tool",
  defaultVersion: "1.0.0",
  versions: [
    {
      version: "1.0.0",
      assets: {
        "macos.*arm64": "auto-install-tool-1.0.0-macos_arm64.tar.gz",
        "linux.*(x86_64|amd64)": "auto-install-tool-1.0.0-linux_amd64.tar.gz",
      },
    },
  ],
};

/**
 * Gitea Release Tool - used by gitea-release e2e tests.
 */
export const GITEA_RELEASE_TOOL: IGiteaToolConfig = {
  repo: "repo/gitea-release-tool",
  toolDir: "tools/gitea-release-tool",
  defaultVersion: "1.0.0",
  versions: [
    {
      version: "1.0.0",
      assets: {
        "macos.*arm64": "gitea-release-tool-1.0.0-macos_arm64.tar.gz",
        "linux.*(x86_64|amd64)": "gitea-release-tool-1.0.0-linux_amd64.tar.gz",
      },
    },
    {
      version: "2.0.0",
      assets: {
        "macos.*arm64": "gitea-release-tool-2.0.0-macos_arm64.tar.gz",
        "linux.*(x86_64|amd64)": "gitea-release-tool-2.0.0-linux_amd64.tar.gz",
      },
    },
  ],
};

/**
 * Cargo Quickinstall Tool - used by generate tests.
 */
export const CARGO_QUICKINSTALL_TOOL: ICargoToolConfig = {
  crateName: "cargo-quickinstall-tool",
  toolDir: "tools/cargo-quickinstall-tool",
  defaultVersion: "1.0.0",
  versions: {
    "1.0.0": {
      "aarch64-apple-darwin": "cargo-quickinstall-tool-1.0.0-aarch64-apple-darwin.tar.gz",
      "x86_64-unknown-linux-gnu": "cargo-quickinstall-tool-1.0.0-x86_64-unknown-linux-musl.tar.gz",
    },
  },
};
