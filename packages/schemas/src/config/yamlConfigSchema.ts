import type { PartialDeep } from 'type-fest';
import { z } from 'zod';

// Shared cache schema factory to avoid duplication across services/hosts
function createCacheSchema(defaults?: { enabled?: boolean; ttl?: number }) {
  const enabledDefault = defaults?.enabled ?? true;
  const ttlDefault = defaults?.ttl ?? 86400000; // 24h
  return z
    .object({
      /** Enables or disables caching for this host/service. */
      enabled: z.boolean().default(enabledDefault),
      /** Time-to-live (TTL) in milliseconds for cache entries. */
      ttl: z.number().default(ttlDefault),
    })
    .strict();
}

export const cacheConfigSchema = createCacheSchema();

// Generic host schema factory with optional token/userAgent and extra fields
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
    defaultUserAgent = 'dotfiles-generator',
    tokenDefault = '',
  } = options;
  return z
    .object({
      host: z.string().default(defaultHost),
      cache: cacheConfigSchema.default(cacheConfigSchema.parse({})),
      token: z.string().default(includeToken ? tokenDefault : ''),
      userAgent: z.string().default(includeUserAgent ? defaultUserAgent : 'dotfiles-generator'),
    })
    .strict();
}

const pathsConfigSchema = z
  .object({
    /** Specifies the root directory of the dotfiles repository. Defaults to `~/.dotfiles`. You SHOULD set this value. */
    // biome-ignore lint/suspicious/noTemplateCurlyInString: Schema default value with variable expansion
    dotfilesDir: z.string().default('${HOME}/.dotfiles'),

    /** Sets the target directory where executable shims for tools will be placed. Defaults to `/usr/local/bin`. */
    targetDir: z.string().default('/usr/local/bin'),
    /** The user's home directory. Defaults to the value of the HOME environment variable. */
    // biome-ignore lint/suspicious/noTemplateCurlyInString: Schema default value with variable expansion
    homeDir: z.string().default('${HOME}'),
    /** Defines the directory where all generated files will be stored. Defaults to `${paths.dotfilesDir}/.generated`. */
    // biome-ignore lint/suspicious/noTemplateCurlyInString: Schema default value with variable expansion
    generatedDir: z.string().default('${paths.dotfilesDir}/.generated'),
    /** Specifies the directory containing `*.tool.ts` tool configuration files. Defaults to `${paths.dotfilesDir}/generator/configs/tools`. */
    // biome-ignore lint/suspicious/noTemplateCurlyInString: Schema default value with variable expansion
    toolConfigsDir: z.string().default('${paths.dotfilesDir}/tools'),
    /** Specifies the directory where generated shell scripts are stored. Defaults to `${paths.generatedDir}/shell-scripts`. */
    // biome-ignore lint/suspicious/noTemplateCurlyInString: Schema default value with variable expansion
    shellScriptsDir: z.string().default('${paths.generatedDir}/shell-scripts'),
    /** Defines the directory where downloaded tool binaries are stored. Defaults to `${paths.generatedDir}/binaries`. */
    // biome-ignore lint/suspicious/noTemplateCurlyInString: Schema default value with variable expansion
    binariesDir: z.string().default('${paths.generatedDir}/binaries'),
  })
  .strict();

const systemConfigSchema = z
  .object({
    /** Custom prompt message to display when `sudo` is required. */
    sudoPrompt: z.string().default('Please enter your password to continue:'),
  })
  .strict();

const loggingConfigSchema = z
  .object({
    /** Controls debug logging output. Defaults to an empty string. */
    debug: z.string().default(''),
  })
  .strict();

const updatesConfigSchema = z
  .object({
    /** Determines if the tool should automatically check for updates on certain runs. Defaults to true. */
    checkOnRun: z.boolean().default(true),
    /** Interval in seconds between automatic update checks for tools. Defaults to 86400 (24 hours). */
    checkInterval: z.number().default(86400),
  })
  .strict();

const gitHubConfigSchema = createHostSchema({
  defaultHost: 'https://api.github.com',
  includeToken: true,
  includeUserAgent: true,
});

// Define individual host schemas for cargo with their own defaults so that cargoConfigSchema.parse({}) succeeds
const cargoCratesIoHostSchema = createHostSchema({ defaultHost: 'https://crates.io' });
const cargoGithubRawHostSchema = createHostSchema({ defaultHost: 'https://raw.githubusercontent.com' });
const cargoGithubReleaseHostSchema = createHostSchema({ defaultHost: 'https://github.com' });

const cargoConfigSchema = z
  .object({
    /** crates.io API host configuration */
    cratesIo: cargoCratesIoHostSchema.default(cargoCratesIoHostSchema.parse({})),
    /** GitHub raw content host configuration for Cargo.toml files */
    githubRaw: cargoGithubRawHostSchema.default(cargoGithubRawHostSchema.parse({})),
    /** GitHub releases/download host configuration */
    githubRelease: cargoGithubReleaseHostSchema.default(cargoGithubReleaseHostSchema.parse({})),
    /** Custom User-Agent string for requests made by the Cargo client. */
    userAgent: z.string().default('dotfiles-generator'),
  })
  .strict();

const downloaderConfigSchema = z
  .object({
    /** Timeout in milliseconds for download operations. Defaults to 300000 (5 minutes). */
    timeout: z.number().default(300000),
    /** Number of retry attempts for failed downloads. Defaults to 3. */
    retryCount: z.number().default(3),
    /** Delay in milliseconds between download retry attempts. Defaults to 1000 (1 second). */
    retryDelay: z.number().default(1000),
    cache: cacheConfigSchema.default(cacheConfigSchema.parse({})),
  })
  .strict();

export const OS_VALUES = ['macos', 'linux', 'windows'] as const;
export const ARCH_VALUES = ['x86_64', 'arm64'] as const;

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

const baseYamlConfigSchemaRequired = z
  .object({
    paths: pathsConfigSchema.required().default(pathsConfigSchema.parse({})),
    system: systemConfigSchema.required().default(systemConfigSchema.parse({})),
    logging: loggingConfigSchema.required().default(loggingConfigSchema.parse({})),
    updates: updatesConfigSchema.required().default(updatesConfigSchema.parse({})),
    github: gitHubConfigSchema.required().default(gitHubConfigSchema.parse({})),
    cargo: cargoConfigSchema.required().default(cargoConfigSchema.parse({})),
    downloader: downloaderConfigSchema.required().default(downloaderConfigSchema.parse({})),
  })
  .strict();

const baseYamlConfigSchemaPartial = z
  .object({
    paths: pathsConfigSchema.partial().optional(),
    system: systemConfigSchema.partial().optional(),
    logging: loggingConfigSchema.partial().optional(),
    updates: updatesConfigSchema.partial().optional(),
    github: gitHubConfigSchema.partial().optional(),
    cargo: cargoConfigSchema.partial().optional(),
    downloader: downloaderConfigSchema.partial().optional(),
  })
  .strict();

const platformOverrideSchema = z
  .object({
    match: z.array(platformMatchSchema).nonempty(),
    get config() {
      return baseYamlConfigSchemaPartial.partial();
    },
  })
  .strict();

export const yamlConfigSchema = baseYamlConfigSchemaRequired
  .extend({
    /** Path to the user's config file. Defaults to `${paths.dotfilesDir}/config.yaml`. This is INTERNAL value and should not be part of the `config.yaml`, it is set dynamically. */
    // biome-ignore lint/suspicious/noTemplateCurlyInString: Schema default value with variable expansion
    userConfigPath: z.string().default('${paths.dotfilesDir}/config.yaml'),

    platform: z.array(platformOverrideSchema).optional(),
  })
  .strict();

export type YamlConfigPaths = z.infer<typeof pathsConfigSchema>;
export type YamlConfig = z.infer<typeof yamlConfigSchema>;
export type YamlConfigPartial = PartialDeep<YamlConfig>;
export type HostConfig = z.infer<ReturnType<typeof createHostSchema>>;
