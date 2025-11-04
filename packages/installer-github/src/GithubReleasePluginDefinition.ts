/**
 * Install method signature for GitHub Release plugin.
 * Returns ToolConfigBuilder for method chaining.
 */
type GithubReleaseInstallMethod = (
  method: 'github-release',
  params: {
    repo: string;
    assetPattern?: string;
    assetSelector?: (assets: unknown[]) => unknown;
    binaryPath?: string;
    version?: string;
  }
) => unknown;

/**
 * GitHub Release plugin definition for type-safe plugin registry.
 *
 * Provides type information for the 'github-release' installation method.
 * When registered with TypeSafePluginRegistry, this plugin's install method
 * signature will be merged into the ToolConfigBuilder's install() method.
 */
export declare const GithubReleasePluginDefinition: {
  new (): {
    createInstallMethod(context: Record<string, unknown>): GithubReleaseInstallMethod;
  };
};
