import { z } from "zod";

export const copyConfigSchema = z
  .object({
    /** The source path (real file or directory) to copy from */
    source: z.string().min(1),
    /** The target path where the copy should be placed */
    target: z.string().min(1),
  })
  .strict();
