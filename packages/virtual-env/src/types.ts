import type { z } from 'zod';
import type { createEnvOptionsSchema, envInfoSchema } from './schemas';

/**
 * Options for creating a virtual environment.
 */
export type CreateEnvOptions = z.infer<typeof createEnvOptionsSchema>;

/**
 * Information about an existing virtual environment.
 */
export type EnvInfo = z.infer<typeof envInfoSchema>;

/**
 * Result of a virtual environment operation.
 */
export type VirtualEnvResult =
  | { success: true; envDir: string; envName: string; }
  | { success: false; error: string; };

/**
 * Result of checking for an active environment.
 */
export type ActiveEnvResult =
  | { active: true; envDir: string; envName: string; }
  | { active: false; };

/**
 * Result of detecting an environment in a directory.
 */
export type DetectEnvResult =
  | { found: true; envDir: string; envName: string; configPath: string; }
  | { found: false; };
