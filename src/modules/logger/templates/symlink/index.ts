import { symlinkDebugTemplates } from './debug';
import { symlinkWarningTemplates } from './warning';

export const symlink = {
  debug: symlinkDebugTemplates,
  warning: symlinkWarningTemplates,
} as const;
