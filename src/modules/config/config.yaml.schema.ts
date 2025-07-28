import { z } from 'zod';
import type { PartialDeep } from 'type-fest';

const pathsConfigSchema = z.object({
  /** The user's home directory. Defaults to the value of the HOME environment variable. */
  homeDir: z.string().default("${HOME}"),
  /** Specifies the root directory of the dotfiles repository. Defaults to `~/.dotfiles`. */
  dotfilesDir: z.string().default("${HOME}/.dotfiles"),
  /** Defines the directory where all generated files will be stored. Defaults to `${paths.dotfilesDir}/.generated`. */
  generatedDir: z.string().default("${paths.dotfilesDir}/.generated"),
  /** Sets the target directory where executable shims for tools will be placed. Defaults to `${paths.generatedDir}/usr-local-bin`. */
  targetDir: z.string().default("${paths.generatedDir}/usr-local-bin"),
  /** Specifies the directory containing `*.tool.ts` tool configuration files. Defaults to `${paths.dotfilesDir}/generator/configs/tools`. */
  toolConfigsDir: z.string().default("${paths.dotfilesDir}/generator/configs/tools"),
  /** Specifies the base directory where shell completion files should be installed. Defaults to `${paths.generatedDir}/completions`. */
  completionsDir: z.string().default("${paths.generatedDir}/completions"),
  /** Defines the directory where downloaded tool binaries are stored. Defaults to `${paths.generatedDir}/binaries`. */
  binariesDir: z.string().default("${paths.generatedDir}/binaries"),
  /** Specifies the path to the manifest file that tracks all generated artifacts. Defaults to `${paths.generatedDir}/manifest.json`. */
  manifestPath: z.string().default("${paths.generatedDir}/manifest.json"),
}).strict();

const systemConfigSchema = z.object({
  /** Custom prompt message to display when `sudo` is required. */
  sudoPrompt: z.string().default("Please enter your password to continue:"),
}).strict();

const loggingConfigSchema = z.object({
  /** Controls debug logging output. Defaults to an empty string. */
  debug: z.string().default(""),
}).strict();

const updatesConfigSchema = z.object({
  /** Determines if the tool should automatically check for updates on certain runs. Defaults to true. */
  checkOnRun: z.boolean().default(true),
  /** Interval in seconds between automatic update checks for tools. Defaults to 86400 (24 hours). */
  checkInterval: z.number().default(86400),
}).strict();

const gitHubCacheConfigSchema = z.object({
  /** Enables or disables caching for GitHub API responses. Defaults to true. */
  enabled: z.boolean().default(true),
  /** Time-to-live (TTL) in milliseconds for GitHub API cache entries. Defaults to 86400000 (24 hours). */
  ttl: z.number().default(86400000),
}).strict();

const gitHubConfigSchema = z.object({
  /** GitHub Personal Access Token (PAT) for accessing the GitHub API. */
  token: z.string().default(""),
  /** Custom GitHub API host URL. Defaults to "https://api.github.com". */
  host: z.string().default("https://api.github.com"),
  /** Custom User-Agent string for requests made by the GitHub API client. Defaults to "dotfiles-generator". */
  userAgent: z.string().default("dotfiles-generator"),
  cache: gitHubCacheConfigSchema.default(gitHubCacheConfigSchema.parse({})),
}).strict();

const downloaderCacheConfigSchema = z.object({
  /** Enables or disables caching for downloaded tool assets. Defaults to true. */
  enabled: z.boolean().default(true),
}).strict();

const downloaderConfigSchema = z.object({
  /** Timeout in milliseconds for download operations. Defaults to 300000 (5 minutes). */
  timeout: z.number().default(300000),
  /** Number of retry attempts for failed downloads. Defaults to 3. */
  retryCount: z.number().default(3),
  /** Delay in milliseconds between download retry attempts. Defaults to 1000 (1 second). */
  retryDelay: z.number().default(1000),
  cache: downloaderCacheConfigSchema.default(downloaderCacheConfigSchema.parse({})),
}).strict();

const OS_VALUES = ['macos', 'linux', 'windows'] as const;
const ARCH_VALUES = ['x86_64', 'arm64'] as const;

const platformMatchSchema = z.union([
  z.object({
    os: z.enum(OS_VALUES),
    arch: z.enum(ARCH_VALUES).optional(),
  }).strict(),
  z.object({
    os: z.enum(OS_VALUES).optional(),
    arch: z.enum(ARCH_VALUES),
  }).strict(),
]);

const baseYamlConfigSchemaRequired =
  z.object({
    paths: pathsConfigSchema.required().default( pathsConfigSchema.parse({})),
    system: systemConfigSchema.required().default( systemConfigSchema.parse({})),
    logging: loggingConfigSchema.required().default( loggingConfigSchema.parse({})),
    updates: updatesConfigSchema.required().default( updatesConfigSchema.parse({})),
    github: gitHubConfigSchema.required().default( gitHubConfigSchema.parse({})),
    downloader: downloaderConfigSchema.required().default( downloaderConfigSchema.parse({})),
  }).strict();

const baseYamlConfigSchemaPartial =
  z.object({
    paths: pathsConfigSchema.partial().optional(),
    system: systemConfigSchema.partial().optional(),
    logging: loggingConfigSchema.partial().optional(),
    updates: updatesConfigSchema.partial().optional(),
    github: gitHubConfigSchema.partial().optional(),
    downloader: downloaderConfigSchema.partial().optional(),
  }).strict();

const platformOverrideSchema = z.object({
  match: z.array(platformMatchSchema).nonempty(),
  get config() {
    return baseYamlConfigSchemaPartial.partial();
  },
}).strict();

export const yamlConfigSchema = baseYamlConfigSchemaRequired.extend({
  /** Path to the user's config file. Defaults to `~/.dotfiles/config.yaml` */
  userConfigPath: z.string().default("${paths.dotfilesDir}/config.yaml"),
  platform: z.array(platformOverrideSchema).optional(),
}).strict();

export type YamlConfigPaths = z.infer<typeof pathsConfigSchema>;
export type YamlConfig = z.infer<typeof yamlConfigSchema>;
export type YamlConfigPartial = PartialDeep<YamlConfig>;

{
  // This is a type assertion to ensure that the schema is correct. DO NOT REMOVE.
  // @ts-ignore
  let check: YamlConfig;

  check = {
    userConfigPath: '',

    paths: {
      homeDir: '',
      dotfilesDir: 'test',
      targetDir: '',
      generatedDir: '',
      toolConfigsDir: '',
      completionsDir: '',
      manifestPath: '',
      binariesDir: '',
    },
    system: {
      sudoPrompt: '',
    },
    logging: {
      debug: '',
    },
    updates: {
      checkOnRun: false,
      checkInterval: 0,
    },
    github: {
      token: '',
      host: '',
      userAgent: '',
      cache: {
        enabled: false,
        ttl: 0,
      },
    },
    downloader: {
      timeout: 0,
      retryCount: 0,
      retryDelay: 0,
      cache: {
        enabled: false,
      },
    },
    platform: [
      {
        match: [{ os: 'macos' }, { arch: 'arm64' }],
        config: {
          paths: {
            dotfilesDir: 'macos-arm64-dotfiles',
          },
        },
      },
    ],
  };
}
