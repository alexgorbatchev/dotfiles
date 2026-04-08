import type { PartialDeep } from "@dotfiles/core";
import { z } from "zod";

/**
 * Creates a Zod schema for cache configuration.
 *
 * This factory function is used to generate consistent cache settings for
 * different services or hosts, ensuring that they all share the same structure
 * for enabling/disabling caching and setting a time-to-live (TTL).
 *
 * @param defaults - Optional default values for `enabled` and `ttl`.
 * @returns A Zod object schema for cache configuration.
 *
 * @internal
 */
function createCacheSchema(defaults?: { enabled?: boolean; ttl?: number }) {
  const enabledDefault = defaults?.enabled ?? true;
  const ttlDefault = defaults?.ttl ?? 86400000; // 24 hours in milliseconds

  return z
    .object({
      /**
       * Enables or disables caching for the associated service or host.
       * @default true
       */
      enabled: z.boolean().default(enabledDefault),
      /**
       * The time-to-live (TTL) for cache entries, specified in milliseconds.
       * After this duration, the cached data is considered stale.
       * @default 86400000 (24 hours)
       */
      ttl: z.number().default(ttlDefault),
    })
    .strict();
}

/**
 * A reusable Zod schema for cache configuration with default values.
 *
 * @see {@link createCacheSchema}
 */
export const cacheConfigSchema = createCacheSchema();

/**
 * Creates a generic Zod schema for a host configuration.
 *
 * This factory is designed to build schemas for services that interact with a
 * remote host. It includes common settings like the host URL, caching rules,
 * and optional authentication tokens or user-agent strings.
 *
 * @param options - Configuration options for the host schema.
 * @param options.defaultHost - The default URL for the host.
 * @param options.includeToken - If `true`, a `token` field is included.
 * @param options.includeUserAgent - If `true`, a `userAgent` field is included.
 * @param options.defaultUserAgent - The default user-agent string.
 * @param options.tokenDefault - The default value for the `token` field.
 * @returns A Zod object schema for the host configuration.
 *
 * @internal
 */
function createHostSchema(options: {
  defaultHost: string;
  includeToken?: boolean;
  includeUserAgent?: boolean;
  defaultUserAgent?: string;
  tokenDefault?: string;
}) {
  const {
    defaultHost,
    includeToken,
    includeUserAgent,
    defaultUserAgent = "dotfiles-generator",
    tokenDefault = "",
  } = options;

  return z
    .object({
      /** The base URL of the host. */
      host: z.string().default(defaultHost),
      /** Caching configuration for this host. */
      cache: cacheConfigSchema.default(cacheConfigSchema.parse({})),
      /** An optional authentication token for accessing the host's API. */
      token: z.string().default(includeToken ? tokenDefault : ""),
      /** The User-Agent string to be sent with requests to this host. */
      userAgent: z.string().default(includeUserAgent ? defaultUserAgent : "dotfiles-generator"),
    })
    .strict();
}

/**
 * A Zod schema for path configurations within the application.
 *
 * This schema defines all the key directory paths used by the application. It
 * supports variable expansion, allowing paths to be defined relative to each
 * other or to environment variables.
 *
 * ### Variable Expansion
 *
 * Path variables can reference environment variables (e.g., `{HOME}`) and other
 * paths defined within this schema (e.g., `{paths.dotfilesDir}`).
 *
 * The resolution order is critical and follows this staged model:
 *
 * ```
 * 1. Bootstrap: {HOME} (from system environment)
 * 2. Resolve: paths.homeDir using bootstrap {HOME}
 * 3. Post-home: Remaining {TOKEN} substitution using resolved paths.homeDir
 * 4. Tilde: ~ expansion (only in paths.* fields) using paths.homeDir
 * └── dotfilesDir
 *     ├── toolConfigsDir
 *     └── generatedDir
 *         ├── shellScriptsDir
 *         └── binariesDir
 *
 * targetDir (independent)
 * ```
 */
const pathsConfigSchema = z
  .object({
    /**
     * The user's home directory.
     * @default `{HOME}` (resolved from the environment variable)
     */
    homeDir: z.string().default(`{HOME}`),

    /**
     * The root directory of the user's dotfiles repository.
     * It is strongly recommended to set this value.
     * @default `{configFileDir}` (the directory containing the config file)
     */
    dotfilesDir: z.string().default(`{configFileDir}`),

    /**
     * The directory where executable shims for tools will be placed. This
     * directory should be in the system's `PATH`.
     * @default `{paths.generatedDir}/bin-default`
     */
    targetDir: z.string().default(`{paths.generatedDir}/bin-default`),

    /**
     * The directory where all generated files (e.g., binaries, shell scripts)
     * will be stored.
     * @default `{paths.dotfilesDir}/.generated`
     */
    generatedDir: z.string().default(`{paths.dotfilesDir}/.generated`),

    /**
     * The directory containing `*.tool.ts` tool configuration files.
     * @default `{paths.dotfilesDir}/tools`
     */
    toolConfigsDir: z.string().default(`{paths.dotfilesDir}/tools`),

    /**
     * The directory where generated shell initialization scripts are stored.
     * @default `{paths.generatedDir}/shell-scripts`
     */
    shellScriptsDir: z.string().default(`{paths.generatedDir}/shell-scripts`),

    /**
     * The directory where downloaded tool binaries and archives are stored.
     * @default `{paths.generatedDir}/binaries`
     */
    binariesDir: z.string().default(`{paths.generatedDir}/binaries`),
  })
  .strict();

/**
 * A Zod schema for system-level configurations.
 */
const systemConfigSchema = z
  .object({
    /**
     * A custom prompt message to display when `sudo` is required for a command.
     * @default 'Please enter your password to continue:'
     */
    sudoPrompt: z.string().default("Please enter your password to continue:"),
  })
  .strict();

/**
 * A Zod schema for logging configurations.
 */
const loggingConfigSchema = z
  .object({
    /**
     * A string controlling debug logging output. Can be used to enable debug
     * logs for specific modules.
     * @default ''
     */
    debug: z.string().default(""),
  })
  .strict();

/**
 * A Zod schema for tool update configurations.
 */
const updatesConfigSchema = z
  .object({
    /**
     * If `true`, the application will automatically check for tool updates
     * during certain runs.
     * @default true
     */
    checkOnRun: z.boolean().default(true),
    /**
     * The interval in seconds between automatic update checks for tools.
     * @default 86400 (24 hours)
     */
    checkInterval: z.number().default(86400),
  })
  .strict();

/**
 * A Zod schema for GitHub API configuration.
 *
 * This schema includes the API host, authentication token, user-agent, and
 * caching settings for interactions with GitHub.
 *
 * @see {@link createHostSchema}
 */
const gitHubConfigSchema = createHostSchema({
  defaultHost: "https://api.github.com",
  includeToken: true,
  includeUserAgent: true,
});

// Define individual host schemas for cargo with their own defaults so that cargoConfigSchema.parse({}) succeeds
const cargoCratesIoHostSchema = createHostSchema({ defaultHost: "https://crates.io" });
const cargoGithubRawHostSchema = createHostSchema({ defaultHost: "https://raw.githubusercontent.com" });
const cargoGithubReleaseHostSchema = createHostSchema({ defaultHost: "https://github.com" });

/**
 * A Zod schema for Cargo (Rust package manager) related configurations.
 *
 * This schema defines settings for interacting with different services that
 * Cargo uses, such as `crates.io` and GitHub for fetching package information
 * and release assets.
 */
const cargoConfigSchema = z
  .object({
    /**
     * Configuration for the `crates.io` API host.
     */
    cratesIo: cargoCratesIoHostSchema.default(cargoCratesIoHostSchema.parse({})),
    /**
     * Configuration for accessing raw file content on GitHub, typically for
     * reading `Cargo.toml` files.
     */
    githubRaw: cargoGithubRawHostSchema.default(cargoGithubRawHostSchema.parse({})),
    /**
     * Configuration for accessing GitHub releases and downloading assets.
     */
    githubRelease: cargoGithubReleaseHostSchema.default(cargoGithubReleaseHostSchema.parse({})),
    /**
     * A custom User-Agent string for requests made by the Cargo client.
     * @default 'dotfiles-generator'
     */
    userAgent: z.string().default("dotfiles-generator"),
  })
  .strict();

/**
 * A Zod schema for the asset downloader configuration.
 */
const downloaderConfigSchema = z
  .object({
    /**
     * The timeout in milliseconds for download operations.
     * @default 300000 (5 minutes)
     */
    timeout: z.number().default(300000),
    /**
     * The number of times to retry a failed download.
     * @default 3
     */
    retryCount: z.number().default(3),
    /**
     * The delay in milliseconds between download retry attempts.
     * @default 1000 (1 second)
     */
    retryDelay: z.number().default(1000),
    /**
     * Caching configuration for downloaded files.
     */
    cache: cacheConfigSchema.default(cacheConfigSchema.parse({})),
  })
  .strict();

/**
 * A Zod schema for feature-specific configurations.
 */
const featuresConfigSchema = z
  .object({
    /**
     * Configuration for the catalog feature, which generates a markdown file
     * listing all managed tools.
     */
    catalog: z
      .object({
        /**
         * If `true`, the catalog file will be generated.
         * @default true
         */
        generate: z.boolean().default(true),
        /**
         * The path where the catalog file will be generated. Supports variable
         * expansion.
         * @default `{paths.dotfilesDir}/CATALOG.md`
         */
        filePath: z.string().default(`{paths.dotfilesDir}/CATALOG.md`),
      })
      .strict()
      .default({ generate: true, filePath: `{paths.dotfilesDir}/CATALOG.md` }),
    /**
     * Configuration for shell initialization.
     * Controls where the shell initialization scripts are sourced.
     */
    shellInstall: z
      .object({
        /**
         * The path to the zsh configuration file (e.g., ~/.zshrc).
         * If not provided, zsh initialization will be skipped.
         */
        zsh: z.string().optional(),
        /**
         * The path to the bash configuration file (e.g., ~/.bashrc).
         * If not provided, bash initialization will be skipped.
         */
        bash: z.string().optional(),
        /**
         * The path to the powershell configuration file (e.g., ~/.config/powershell/profile.ps1).
         * If not provided, powershell initialization will be skipped.
         */
        powershell: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/**
 * An array of supported operating system identifiers.
 */
export const OS_VALUES = ["macos", "linux", "windows"] as const;

/**
 * An array of supported CPU architecture identifiers.
 */
export const ARCH_VALUES = ["x86_64", "arm64"] as const;

/**
 * A Zod schema for matching platform-specific criteria (OS and architecture).
 *
 * This schema is used in platform overrides to target configurations to
 * specific environments.
 *
 * @internal
 */
const platformMatchSchema = z.union([
  z
    .object({
      os: z.enum(OS_VALUES),
      arch: z.enum(ARCH_VALUES).optional(),
    })
    .strict(),
  z
    .object({
      os: z.enum(OS_VALUES).optional(),
      arch: z.enum(ARCH_VALUES),
    })
    .strict(),
]);

/**
 * The base Zod schema for the main application configuration, with all
 * properties required and default values applied.
 *
 * @internal
 */
const baseProjectConfigSchemaRequired = z
  .object({
    paths: pathsConfigSchema.required().default(pathsConfigSchema.parse({})),
    system: systemConfigSchema.required().default(systemConfigSchema.parse({})),
    logging: loggingConfigSchema.required().default(loggingConfigSchema.parse({})),
    updates: updatesConfigSchema.required().default(updatesConfigSchema.parse({})),
    github: gitHubConfigSchema.required().default(gitHubConfigSchema.parse({})),
    cargo: cargoConfigSchema.required().default(cargoConfigSchema.parse({})),
    downloader: downloaderConfigSchema.required().default(downloaderConfigSchema.parse({})),
    features: featuresConfigSchema.default(featuresConfigSchema.parse({})),
  })
  .strict();

/**
 * A partial version of the base Zod schema, used for platform-specific
 * overrides where only a subset of properties may be provided.
 *
 * @internal
 */
const baseProjectConfigSchemaPartial = z
  .object({
    paths: pathsConfigSchema.partial().optional(),
    system: systemConfigSchema.partial().optional(),
    logging: loggingConfigSchema.partial().optional(),
    updates: updatesConfigSchema.partial().optional(),
    github: gitHubConfigSchema.partial().optional(),
    cargo: cargoConfigSchema.partial().optional(),
    downloader: downloaderConfigSchema.partial().optional(),
    features: featuresConfigSchema.partial().optional(),
  })
  .strict();

/**
 * A Zod schema for a platform-specific override configuration.
 *
 * This allows certain configuration values to be applied only when the
 * specified OS and/or architecture conditions are met.
 *
 * @internal
 */
const platformOverrideSchema = z
  .object({
    /** An array of platform-matching criteria. */
    match: z.array(platformMatchSchema).nonempty(),
    /** The partial configuration to apply if the criteria match. */
    get config() {
      return baseProjectConfigSchemaPartial.partial();
    },
  })
  .strict();

/**
 * The main Zod schema for the application's `dotfiles.config.ts` file.
 *
 * This schema combines the base configuration with an optional array of
 * platform-specific overrides. It is used to parse and validate the entire
 * configuration file.
 */
export const projectConfigSchema = baseProjectConfigSchemaRequired
  .extend({
    /**
     * An optional array of platform-specific overrides. Each override applies
     * a partial configuration when the specified OS and/or architecture matches
     * the current system.
     */
    platform: z.array(platformOverrideSchema).optional(),
  })
  .strict();

/**
 * A TypeScript type representing the paths section of the YAML configuration.
 */
export type ProjectConfigPaths = z.infer<typeof pathsConfigSchema>;

/**
 * A deep partial TypeScript type for the project configuration.
 *
 * This is useful for functions that merge or override configuration values,
 * allowing any part of the configuration to be optionally provided.
 */
export type ProjectConfigPartial = PartialDeep<ProjectConfig>;

/**
 * A Zod schema for private fields that are added to the configuration object
 * after it is loaded. These fields are not part of the user-facing `dotfiles.config.ts`.
 *
 * @internal
 */
export const privateProjectConfigFields = z.object({
  /** The absolute path to the loaded configuration file. */
  configFilePath: z.string(),
  /** The absolute path to the directory containing the configuration file. */
  configFileDir: z.string(),
});

/**
 * The complete TypeScript type for the application's configuration object.
 *
 * This type is inferred from the main Zod schema and includes both the
 * user-defined configuration from `dotfiles.config.ts` and the private, internally-managed
 * fields.
 */
export type ProjectConfig = z.infer<typeof projectConfigSchema> & z.infer<typeof privateProjectConfigFields>;
