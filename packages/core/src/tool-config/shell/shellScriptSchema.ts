import { z } from 'zod';
import type { ShellScript } from '../../shell/shellScript.types';

// Custom Zod schema for ShellScript branded types
// We can't validate the brand at runtime, so we accept both string and String objects
export const shellScriptSchema = z.union([z.string(), z.instanceof(String)]).transform((val) => val as ShellScript);
