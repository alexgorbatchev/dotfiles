import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const symlinkWarningTemplates = {
  /**
   * Emitted when a configured symlink's source file is missing.
   * Includes the tool name for clearer diagnostics.
   */
  sourceNotFound: (): SafeLogMessage => createSafeLogMessage('Tool "%s" source file not found: %s'),
} as const;
