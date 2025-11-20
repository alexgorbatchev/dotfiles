import { z } from 'zod';
import { installHookSchema } from '../hooks/installHookSchema';

export const baseInstallParamsSchema = z
  .object({
    /**
     * A record of environment variables to be set specifically for the duration of this tool's installation process.
     * These variables are applied before any installation commands or hooks are executed.
     * @example
     * env: {
     *   CUSTOM_FLAG: 'true',
     *   API_KEY: 'secret'
     * }
     */
    env: z.record(z.string(), z.string()).optional(),
    /**
     * A collection of optional asynchronous hook functions that can be executed at different stages
     * of the installation lifecycle.
     *
     * Hooks are specified as arrays of functions with kebab-case keys:
     * - 'before-install', 'after-download', 'after-extract', 'after-install'
     */
    hooks: z
      .object({
        /** Runs before any other installation steps (download, extract, main install command) begin. */
        'before-install': z.array(installHookSchema).optional(),
        /** Runs after download but before extraction or execution. */
        'after-download': z.array(installHookSchema).optional(),
        /** Runs after extraction but before the main binary is finalized. */
        'after-extract': z.array(installHookSchema).optional(),
        /** Runs after the main installation command completes. */
        'after-install': z.array(installHookSchema).optional(),
      })
      .partial()
      .optional(),
  })
  .strict();

/**
 * Base interface for parameters common to all installation methods.
 * This includes environment variables to set during installation and a set of lifecycle hooks.
 */
export type BaseInstallParams = z.infer<typeof baseInstallParamsSchema>;
