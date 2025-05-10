/**
 * @file src/config.ts
 * @description Application configuration management.
 * This module exports a pure function `createAppConfig` to generate configuration.
 *
 * ## Development Plan
 *
 * ### Mandatory Pre-read:
 * - `.clinerules` (Functional Purity, Data Validation, DI)
 * - `memory-bank/techContext.md`
 * - `generator/src/types.ts` (for AppConfig type)
 *
 * ### Tasks:
 * - [x] Define `SystemInfo` and `ConfigEnvironment` interfaces.
 * - [x] Define `EnvSchema` using Zod for environment variable validation.
 * - [x] Implement `createAppConfig` as a pure function.
 *   - [x] It must accept `SystemInfo` and `ConfigEnvironment` as arguments.
 *   - [x] It must use `EnvSchema` to parse and validate the `ConfigEnvironment` argument.
 *   - [x] It must not call `dotenv` or access `process.env` directly.
 *   - [x] It must return a new `AppConfig` object based on inputs and defaults.
 * - [ ] (No top-level appConfig constant initialized at module load time)
 * - [ ] (Application entry point will be responsible for gathering inputs and calling createAppConfig)
 * - [ ] Update tests for `createAppConfig`.
 * - [ ] Cleanup all linting errors and warnings.
 * - [ ] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [ ] Ensure 100% test coverage.
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import { resolve, join } from 'path';
import { z } from 'zod';
import type { AppConfig } from './types';

// Interface for system-specific values needed by createAppConfig
export interface SystemInfo {
  homedir: string;
  // cwd is not directly used by createAppConfig anymore for resolving .env,
  // as .env loading is externalized. It might be needed if any paths
  // in config defaults were relative to cwd, but currently they are based on homedir.
  // Keeping it for potential future use or if AppConfig needs a CWD property.
  cwd: string;
}

// Interface for the environment variables relevant to the config
// This defines the raw shape expected from the environment.
export interface ConfigEnvironment {
  DOTFILES_DIR?: string;
  GENERATED_DIR?: string;
  TARGET_DIR?: string;
  TOOL_CONFIG_DIR?: string;
  DEBUG?: string;
  CACHE_ENABLED?: string; // Raw string from env
  SUDO_PROMPT?: string;
}

// Zod schema for validating and transforming the raw environment variables
const EnvSchema = z.object({
  DOTFILES_DIR: z.string().optional(),
  GENERATED_DIR: z.string().optional(),
  TARGET_DIR: z.string().optional(),
  TOOL_CONFIG_DIR: z.string().optional(),
  DEBUG: z.string().optional(),
  CACHE_ENABLED: z
    .string()
    .optional()
    .transform((val) => val === undefined || val.toLowerCase() === 'true'), // Default true if undefined or "true"
  SUDO_PROMPT: z.string().optional(),
});

type ValidatedEnv = z.infer<typeof EnvSchema>;

export function createAppConfig(
  systemInfo: SystemInfo,
  rawEnv: ConfigEnvironment // Expects an object matching ConfigEnvironment shape
): AppConfig {
  // 1. Validate and transform the raw environment variables using Zod
  const env: ValidatedEnv = EnvSchema.parse(rawEnv);

  // 2. Proceed with defaults and constructing AppConfig using the validated 'env'
  const defaultDotfilesDir = resolve(systemInfo.homedir, '.dotfiles');
  const DOTFILES_DIR = env.DOTFILES_DIR || defaultDotfilesDir;
  const GENERATED_DIR = env.GENERATED_DIR || join(DOTFILES_DIR, '.generated');

  return {
    targetDir: env.TARGET_DIR || '/usr/bin',
    dotfilesDir: DOTFILES_DIR,
    generatedDir: GENERATED_DIR,
    toolConfigDir: env.TOOL_CONFIG_DIR || join(DOTFILES_DIR, 'generator', 'src', 'tools'),
    debug: env.DEBUG || '',
    cacheEnabled: env.CACHE_ENABLED, // This is now a boolean from Zod transform
    sudoPrompt: env.SUDO_PROMPT,

    // Derived paths
    cacheDir: join(GENERATED_DIR, 'cache'),
    binariesDir: join(GENERATED_DIR, 'binaries'),
    binDir: join(GENERATED_DIR, 'bin'),
    zshInitDir: join(GENERATED_DIR, 'zsh'),
    manifestPath: join(GENERATED_DIR, 'manifest.json'),
  };
}
