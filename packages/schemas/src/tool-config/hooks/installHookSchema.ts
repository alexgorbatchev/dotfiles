import { z } from 'zod';
import type { EnhancedInstallHookContext } from '../../installer/installHooks.types';

// Hook function schema - validates that hooks are functions with correct signature
export const installHookSchema = z.custom<(context: EnhancedInstallHookContext) => Promise<void>>(
  (val) => typeof val === 'function',
  'Must be a function'
);

/**
 * Install hook function schema type
 */
export type InstallHookSchema = z.infer<typeof installHookSchema>;
