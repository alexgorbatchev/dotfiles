import { z } from 'zod';
import { completionConfigSchema } from './completionConfigSchema';
import { platformConfigEntrySchema } from './platformConfigEntrySchema';
import { shellConfigsSchema } from './shellConfigsSchema';
import { symlinkConfigSchema } from './symlinkConfigSchema';
import { toolConfigUpdateCheckSchema } from './toolConfigUpdateCheckSchema';

export const baseToolConfigPropertiesSchema = z
  .object({
    /** The unique name of the tool, as defined by `c.name()`. */
    name: z.string().min(1),
    /**
     * An array of binary names that should have shims generated for this tool.
     * Defined by `c.bin()`. Can be undefined if no binaries are specified (e.g., for a config-only tool).
     */
    binaries: z.array(z.string().min(1)).optional(),
    /** The desired version of the tool, defined by `c.version()`. Defaults to 'latest'. */
    version: z.string(),
    /** The absolute path to the tool configuration file that defined this configuration. */
    configFilePath: z.string().optional(),
    /** Shell configurations organized by shell type, added via `c.zsh()`, `c.bash()`, `c.powershell()`. */
    shellConfigs: shellConfigsSchema.optional(),
    /**
     * An array of symlink configurations, added via `c.symlink()`. Each object has `source` and `target` paths where
     * `source` is real file and `target` is the symlink.
     *
     * Analogous to `ln -s source target`.
     */
    symlinks: z.array(symlinkConfigSchema).optional(),
    /** Shell completion configurations, defined by `c.completions()`. */
    completions: completionConfigSchema.optional(),
    /**
     * Configuration for automatic update checking for this tool.
     */
    updateCheck: toolConfigUpdateCheckSchema.optional(),
    /**
     * An array of platform-specific configurations.
     * Each entry defines configurations for a specific set of platforms and optionally architectures.
     */
    platformConfigs: z.array(platformConfigEntrySchema).optional(),
  })
  .strict();

/**
 * Base properties common to all variants of a fully resolved ToolConfig.
 * This represents the internal data structure after the `ToolConfigBuilder` has been processed.
 */
export type BaseToolConfigProperties = z.infer<typeof baseToolConfigPropertiesSchema>;
