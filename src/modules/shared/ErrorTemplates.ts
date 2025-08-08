import { toolErrorTemplates } from './ErrorTemplates--tool';
import { fsErrorTemplates } from './ErrorTemplates--fs';
import { configErrorTemplates } from './ErrorTemplates--config';
import { serviceErrorTemplates } from './ErrorTemplates--service';
import { commandErrorTemplates } from './ErrorTemplates--command';
import { archiveErrorTemplates } from './ErrorTemplates--archive';
import { cacheErrorTemplates } from './ErrorTemplates--cache';
import { cacheDebugTemplates } from './DebugTemplates--cache';
import { downloaderDebugTemplates } from './DebugTemplates--downloader';
import { commandDebugTemplates } from './DebugTemplates--command';
import { extractorDebugTemplates } from './DebugTemplates--extractor';
import { generatorDebugTemplates } from './DebugTemplates--generator';
import { registryDebugTemplates } from './DebugTemplates--registry';
import { shellInitDebugTemplates } from './DebugTemplates--shellInit';
import { shimDebugTemplates } from './DebugTemplates--shim';
import { symlinkDebugTemplates } from './DebugTemplates--symlink';
import { githubClientDebugTemplates } from './DebugTemplates--githubClient';
import { versionCheckerDebugTemplates } from './DebugTemplates--versionChecker';
import { hookExecutorDebugTemplates } from './DebugTemplates--hookExecutor';
import { installerDebugTemplates } from './DebugTemplates--installer';
import { toolWarningTemplates } from './WarningTemplates--tool';
import { configWarningTemplates } from './WarningTemplates--config';
import { fsWarningTemplates } from './WarningTemplates--fs';
import { serviceWarningTemplates } from './WarningTemplates--service';
import { generalWarningTemplates } from './WarningTemplates--general';
import { toolSuccessTemplates } from './SuccessTemplates--tool';
import { configSuccessTemplates } from './SuccessTemplates--config';
import { operationSuccessTemplates } from './SuccessTemplates--operation';
import { fsSuccessTemplates } from './SuccessTemplates--fs';
import { architectureSuccessTemplates } from './SuccessTemplates--architecture';
import { downloaderSuccessTemplates } from './SuccessTemplates--downloader';
import { cacheSuccessTemplates } from './SuccessTemplates--cache';
import { registrySuccessTemplates } from './SuccessTemplates--registry';
import { generalSuccessTemplates } from './SuccessTemplates--general';

// Re-export the utility function for use in template files
export { createSafeLogMessage } from './utils';

/**
 * Standardized error message templates for consistent logging across the application.
 * 
 * All template functions return SafeLogMessage objects that are type-safe for use with
 * the SafeTsLogger. This prevents arbitrary strings from being passed to log methods.
 * 
 * Usage:
 * ```typescript
 * import { ErrorTemplates } from '@modules/shared/ErrorTemplates';
 * 
 * // Type-safe logging - only SafeLogMessage accepted as first argument:
 * logger.error(ErrorTemplates.tool.installFailed('github-release', toolName, error.message));
 * logger.debug('Installation error details: %O', error); // Additional template args still work
 * 
 * // This would cause a TypeScript error:
 * logger.error('Raw string not allowed'); // ❌ Type error!
 * ```
 */
export const ErrorTemplates = {
  tool: toolErrorTemplates,
  fs: fsErrorTemplates,
  config: configErrorTemplates,
  service: serviceErrorTemplates,
  command: commandErrorTemplates,
  archive: archiveErrorTemplates,
  cache: cacheErrorTemplates,
} as const;

/**
 * Debug message templates for trace/debug level logging
 */
export const DebugTemplates = {
  cache: cacheDebugTemplates,
  downloader: downloaderDebugTemplates,
  command: commandDebugTemplates,
  extractor: extractorDebugTemplates,
  generator: generatorDebugTemplates,
  registry: registryDebugTemplates,
  shellInit: shellInitDebugTemplates,
  shim: shimDebugTemplates,
  symlink: symlinkDebugTemplates,
  githubClient: githubClientDebugTemplates,
  versionChecker: versionCheckerDebugTemplates,
  hookExecutor: hookExecutorDebugTemplates,
  installer: installerDebugTemplates,
} as const;

/**
 * Warning message templates for consistent logging
 */
export const WarningTemplates = {
  tool: toolWarningTemplates,
  config: configWarningTemplates,
  fs: fsWarningTemplates,
  service: serviceWarningTemplates,
  general: generalWarningTemplates,
} as const;

/**
 * Success message templates for consistent positive feedback
 */
export const SuccessTemplates = {
  tool: toolSuccessTemplates,
  config: configSuccessTemplates,
  operation: operationSuccessTemplates,
  fs: fsSuccessTemplates,
  architecture: architectureSuccessTemplates,
  downloader: downloaderSuccessTemplates,
  cache: cacheSuccessTemplates,
  registry: registrySuccessTemplates,
  general: generalSuccessTemplates,
} as const;
