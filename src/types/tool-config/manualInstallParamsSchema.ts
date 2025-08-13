import { z } from 'zod';
import { baseInstallParamsSchema } from './baseInstallParamsSchema';

/**
 * Parameters for a "manual" installation method.
 * This method is used when the tool is expected to be installed by some other means
 * (e.g., system package manager not covered, user installs it manually, or it's part of the OS).
 * The generator will primarily check for the existence of the binary at the specified path.
 * Hooks can be used to provide custom validation or setup steps.
 */
export const manualInstallParamsSchema = baseInstallParamsSchema.extend({
  /**
   * The expected absolute path to the tool's binary if it's installed manually or by other means.
   * The generator will check this path to verify installation.
   */
  binaryPath: z.string().min(1),
});

/**
 * Parameters for a "manual" installation method.
 * This method is used when the tool is expected to be installed by some other means
 * (e.g., system package manager not covered, user installs it manually, or it's part of the OS).
 * The generator will primarily check for the existence of the binary at the specified path.
 * Hooks can be used to provide custom validation or setup steps.
 */
export type ManualInstallParams = z.infer<typeof manualInstallParamsSchema>;
