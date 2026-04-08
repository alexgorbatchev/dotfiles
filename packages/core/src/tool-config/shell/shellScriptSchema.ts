import { z } from "zod";
import type { ShellScript } from "../../shell/shellScript.types";

// Zod schema for ShellScript discriminated union
export const shellScriptSchema = z.object({
  kind: z.enum(["once", "always"]),
  value: z.string(),
}) as z.ZodType<ShellScript>;
