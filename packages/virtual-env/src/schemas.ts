import { z } from "zod";

/**
 * Schema for validating create environment options.
 */
export const createEnvOptionsSchema = z.object({
  /**
   * Name of the environment directory to create.
   */
  name: z.string().min(1).default("env"),

  /**
   * Parent directory where the environment will be created (defaults to cwd).
   */
  parentDir: z.string().min(1),

  /**
   * Whether to overwrite an existing environment.
   */
  force: z.boolean().default(false),
});

/**
 * Schema for environment info.
 */
export const envInfoSchema = z.object({
  /**
   * Absolute path to the environment directory.
   */
  envDir: z.string(),

  /**
   * Name of the environment.
   */
  name: z.string(),

  /**
   * Path to the configuration file.
   */
  configPath: z.string(),

  /**
   * Path to the source/activation script.
   */
  sourcePath: z.string(),

  /**
   * Path to the tools directory.
   */
  toolsDir: z.string(),
});
