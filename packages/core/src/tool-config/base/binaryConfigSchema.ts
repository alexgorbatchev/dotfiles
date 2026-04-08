import { z } from "zod";

/**
 * Schema for binary configuration with name and pattern
 */
export const binaryConfigSchema = z
  .object({
    name: z.string().min(1),
    pattern: z.string().min(1),
  })
  .strict();

/**
 * Configuration for a single binary within a tool
 */
export type BinaryConfig = z.infer<typeof binaryConfigSchema>;

export interface IBinaryConfig extends BinaryConfig {}
