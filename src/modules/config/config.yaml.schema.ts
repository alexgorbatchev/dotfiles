/**
 * @file Defines the Zod schema for validating the `config.yaml` file.
 */
import { z } from 'zod';

const pathsConfigSchema = z.object({
  homeDir: z.string(),
  dotfilesDir: z.string(),
  targetDir: z.string(),
  generatedDir: z.string(),
  toolConfigsDir: z.string(),
  completionsDir: z.string(),
  manifestPath: z.string(),
  binariesDir: z.string(),
});

const systemConfigSchema = z.object({
  sudoPrompt: z.string(),
});

const loggingConfigSchema = z.object({
  debug: z.string(),
});

const updatesConfigSchema = z.object({
  checkOnRun: z.boolean(),
  checkInterval: z.number(),
});

const gitHubCacheConfigSchema = z.object({
  enabled: z.boolean(),
  ttl: z.number(),
});

const gitHubConfigSchema = z.object({
  token: z.string(),
  host: z.string(),
  userAgent: z.string(),
  cache: gitHubCacheConfigSchema,
});

const downloaderCacheConfigSchema = z.object({
  enabled: z.boolean(),
});

const downloaderConfigSchema = z.object({
  timeout: z.number(),
  retryCount: z.number(),
  retryDelay: z.number(),
  cache: downloaderCacheConfigSchema,
});

const OS_VALUES = ['macos', 'linux', 'windows'] as const;
const ARCH_VALUES = ['x86_64', 'arm64'] as const;

const platformMatchSchema = z.union([
  z.object({
    os: z.enum(OS_VALUES),
    arch: z.enum(ARCH_VALUES).optional(),
  }),
  z.object({
    os: z.enum(OS_VALUES).optional(),
    arch: z.enum(ARCH_VALUES),
  }),
]);

const baseYamlConfigSchemaRequired =
  z.object({
    paths: pathsConfigSchema.required(),
    system: systemConfigSchema.required(),
    logging: loggingConfigSchema.required(),
    updates: updatesConfigSchema.required(),
    github: gitHubConfigSchema.required(),
    downloader: downloaderConfigSchema.required(),
  });

const baseYamlConfigSchemaPartial =
  z.object({
    paths: pathsConfigSchema.partial().optional(),
    system: systemConfigSchema.partial().optional(),
    logging: loggingConfigSchema.partial().optional(),
    updates: updatesConfigSchema.partial().optional(),
    github: gitHubConfigSchema.partial().optional(),
    downloader: downloaderConfigSchema.partial().optional(),
  });

const platformOverrideSchema = z.object({
  match: z.array(platformMatchSchema).nonempty(),
  get config() {
    return baseYamlConfigSchemaPartial.partial();
  },
});

export const yamlConfigSchema = baseYamlConfigSchemaRequired.extend({
  platform: z.array(platformOverrideSchema).optional(),
});

export type YamlConfigPaths = z.infer<typeof pathsConfigSchema>;
export type YamlConfig = z.infer<typeof yamlConfigSchema>;

{
  // This is a type assertion to ensure that the schema is correct. DO NOT REMOVE.
  // @ts-ignore
  let check: YamlConfig;

  check = {
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
