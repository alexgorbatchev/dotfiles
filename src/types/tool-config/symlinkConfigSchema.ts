import { z } from 'zod';

export const symlinkConfigSchema = z
  .object({
    /** The source path (real file) for the symlink */
    source: z.string().min(1),
    /** The target path where the symlink should be created */
    target: z.string().min(1),
  })
  .strict();

/**
 * Symlink configuration with source and target paths where
 * `source` is real file and `target` is the symlink.
 * Analogous to `ln -s source target`.
 */
export type SymlinkConfig = z.infer<typeof symlinkConfigSchema>;
