import { z } from 'zod';
import { shellConfigsSchema } from '../shell/shellConfigsSchema';
import { toolConfigUpdateCheckSchema } from '../toolConfigUpdateCheckSchema';
import { binaryConfigSchema } from './binaryConfigSchema';
import { copyConfigSchema } from './copyConfigSchema';
import { symlinkConfigSchema } from './symlinkConfigSchema';

/**
 * Common properties shared between base tool config and platform config schemas.
 * This includes all configurable properties that can be overridden at the platform level.
 */
export const commonToolConfigPropertiesSchema = z
  .object({
    /**
     * An array of binary names or configurations that should have shims generated for this tool.
     * Can be simple strings for basic binaries or IBinaryConfig objects for pattern-based location.
     * Defined by `c.bin()`. Can be undefined if no binaries are specified (e.g., for a config-only tool).
     */
    binaries: z.array(z.union([z.string().min(1), binaryConfigSchema])).optional(),
    /** Binary dependencies that must be available before generating this tool. */
    dependencies: z.array(z.string().min(1)).optional(),
    /**
     * When true, the tool is skipped during generation.
     * Useful for temporarily disabling a tool without removing its configuration.
     */
    disabled: z.boolean().optional(),
    /**
     * Hostname pattern to match for this tool.
     * Can be a literal string or a regex pattern (prefixed with / and suffixed with /).
     * When set, the tool is only installed on machines where the hostname matches.
     */
    hostname: z.string().optional(),
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
     * An array of copy configurations, added via `c.copy()`. Each object has `source` and `target` paths where
     * `source` is the real file or directory and `target` is the destination.
     *
     * Analogous to `cp -r source target`.
     */
    copies: z.array(copyConfigSchema).optional(),
    /**
     * Configuration for automatic update checking for this tool.
     */
    updateCheck: toolConfigUpdateCheckSchema.optional(),
  })
  .strict();
