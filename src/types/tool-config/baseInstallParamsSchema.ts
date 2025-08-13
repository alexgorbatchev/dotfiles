import { z } from 'zod';
import { installHookSchema } from './installHookSchema';

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
     */
    hooks: z
      .object({
        /** Runs before any other installation steps (download, extract, main install command) begin. */
        beforeInstall: installHookSchema.optional(),
        /** Runs after the tool's primary artifact (e.g., archive, script) has been downloaded but before extraction or execution. */
        afterDownload: installHookSchema.optional(),
        /** Runs after an archive has been extracted (if applicable to the installation method) but before the main binary is finalized. */
        afterExtract: installHookSchema.optional(),
        /** Runs after the main installation command or process for the tool has completed and the binary is expected to be in place. */
        afterInstall: installHookSchema.optional(),
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
