import { z } from "zod";

export const toolConfigUpdateCheckSchema = z
  .object({
    /**
     * Whether update checking is enabled for this tool.
     * Can be overridden globally by `ProjectConfig.checkUpdatesOnRun`.
     * @default true
     */
    enabled: z.boolean().optional(),
    /**
     * An optional SemVer constraint for updates. If specified, only updates satisfying
     * this constraint relative to the currently installed version will be considered.
     * E.g., if `1.2.3` is installed and constraint is `~1.2.x`, then `1.2.4` is an update, but `1.3.0` is not.
     * If `^1.2.3` is installed, then `1.3.0` is an update, but `2.0.0` is not.
     */
    constraint: z.string().optional(),
  })
  .strict();

/**
 * Configuration for automatic update checking for this tool.
 */
export type ToolConfigUpdateCheck = z.infer<typeof toolConfigUpdateCheckSchema>;
