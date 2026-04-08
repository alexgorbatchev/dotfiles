import { z } from "zod";

export const symlinkConfigSchema = z
  .object({
    /** The source path (real file) for the symlink */
    source: z.string().min(1),
    /** The target path where the symlink should be created */
    target: z.string().min(1),
  })
  .strict();
