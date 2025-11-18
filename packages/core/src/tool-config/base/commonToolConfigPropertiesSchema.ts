import { z } from 'zod';
import { shellConfigsSchema } from '../shell/shellConfigsSchema';
import { toolConfigUpdateCheckSchema } from '../toolConfigUpdateCheckSchema';
import { binaryConfigSchema } from './binaryConfigSchema';
import { symlinkConfigSchema } from './symlinkConfigSchema';

/**
 * Common properties shared between base tool config and platform config schemas.
 * This includes all configurable properties that can be overridden at the platform level.
 */
export const commonToolConfigPropertiesSchema = z
  .object({
    /**
     * An array of binary names or configurations that should have shims generated for this tool.
     * Can be simple strings for basic binaries or BinaryConfig objects for pattern-based location.
     * Defined by `c.bin()`. Can be undefined if no binaries are specified (e.g., for a config-only tool).
     */
    binaries: z.array(z.union([z.string().min(1), binaryConfigSchema])).optional(),
    /** Binary dependencies that must be available before generating this tool. */
    dependencies: z.array(z.string().min(1)).optional(),
    /** The desired version of the tool, defined by `c.version()`. Defaults to 'latest'. */
    version: z.string().optional(),
    /** Shell configurations organized by shell type, added via `c.zsh()`, `c.bash()`, `c.powershell()`. */
    shellConfigs: shellConfigsSchema.optional(),
    /**
     * An array of symlink configurations, added via `c.symlink()`. Each object has `source` and `target` paths where
     * `source` is real file and `target` is the symlink.
     *
     * Analogous to `ln -s source target`.
     */
    symlinks: z.array(symlinkConfigSchema).optional(),
    /**
     * Configuration for automatic update checking for this tool.
     */
    updateCheck: toolConfigUpdateCheckSchema.optional(),
  })
  .strict();
