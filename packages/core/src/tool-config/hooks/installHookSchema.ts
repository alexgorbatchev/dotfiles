import { z } from 'zod';
import type { AfterInstallContext } from '../../installer/installHooks.types';

// Hook function schema - validates that hooks are functions with correct signature
export const installHookSchema = z.custom<(context: AfterInstallContext) => Promise<void>>(
  (val) => typeof val === 'function',
  'Must be a function'
);
