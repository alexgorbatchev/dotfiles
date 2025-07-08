/**
 * @file Defines the Zod schema for validating the `config.yaml` file.
 *
 * ## Development Plan
 *
 * - [x] Define the Zod schema for the `config.yaml` file.
 * - [ ] Write tests for the schema.
 * - [ ] Fix all errors and warnings.
 * - [ ] Remove all commented out code and meta-comments.
 * - [ ] Ensure 100% test coverage for executable code.
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */
import { z } from 'zod/v4';

const pathsConfigSchema = z
  .object({
    dotfilesDir: z.string(),
    targetDir: z.string(),
    generatedDir: z.string(),
    toolConfigsDir: z.string(),
    completionsDir: z.string(),
    manifestPath: z.string(),
  })

const systemConfigSchema = z
  .object({
    sudoPrompt: z.string(),
  })

const loggingConfigSchema = z
  .object({
    debug: z.string(),
  })

const updatesConfigSchema = z
  .object({
    checkOnRun: z.boolean(),
    checkInterval: z.number(),
  })

const gitHubCacheConfigSchema = z
  .object({
    enabled: z.boolean(),
    ttl: z.number(),
  })

const gitHubConfigSchema = z
  .object({
    token: z.string(),
    host: z.string(),
    userAgent: z.string(),
    cache: gitHubCacheConfigSchema,
  })

const downloaderCacheConfigSchema = z
  .object({
    enabled: z.boolean(),
  })

const downloaderConfigSchema = z
  .object({
    timeout: z.number(),
    retryCount: z.number(),
    retryDelay: z.number(),
    cache: downloaderCacheConfigSchema,
  })

const platformMatchSchema = z.object({
  os: z.enum(['macos', 'linux', 'windows']).optional(),
  arch: z.enum(['x86_64', 'arm64']).optional(),
});

const baseYamlConfigSchema = (required: boolean) =>
  z.object({
    paths: required ? pathsConfigSchema.required() : pathsConfigSchema.optional(),
    system: required ? systemConfigSchema.required() : systemConfigSchema.optional(),
    logging: required ? loggingConfigSchema.required() : loggingConfigSchema.optional(),
    updates: required ? updatesConfigSchema.required() : updatesConfigSchema.optional(),
    github: required ? gitHubConfigSchema.required() : gitHubConfigSchema.optional(),
    downloader: required ? downloaderConfigSchema.required() : downloaderConfigSchema.optional(),
  });

const platformOverrideSchema = z.lazy(() =>
  z.object({
    match: z.array(platformMatchSchema).nonempty(),
    get config() {
      return baseYamlConfigSchema(false).partial();
    },
  })
);

export const yamlConfigSchema = baseYamlConfigSchema(true).extend({
  platform: z.array(platformOverrideSchema).optional(),
});

type BaseYamlConfig = z.infer<typeof baseYamlConfigSchema>;
const f: BaseYamlConfig & { platform?: Array<z.infer<typeof platformOverrideSchema>> } = {
  paths: {
    dotfilesDir: 'test',
    targetDir: '',
    generatedDir: '',
    toolConfigsDir: '',
    completionsDir: '',
    manifestPath: '',
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
      // match: [{ os: 'macos', arch: 'arm64' }],
      match: [{ }],
      config: {
        paths: {
          dotfilesDir: 'macos-arm64-dotfiles',
        },
      },
    },
  ],
};
