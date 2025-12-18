import fs from 'node:fs';
import path from 'node:path';

import type { IBuildContext } from '../types';
import { symlinkDirectory } from './symlinkDirectory';

/**
 * Prepares node_modules for the tsd tests project by symlinking required dependencies.
 */
export function ensureTsdTestsNodeModules(context: IBuildContext): void {
  fs.mkdirSync(context.paths.tsdTestsNodeModulesPath, { recursive: true });

  const tsdModuleSourcePath: string = path.join(context.paths.rootNodeModulesPath, 'tsd');
  const tsdModuleDestinationPath: string = path.join(context.paths.tsdTestsNodeModulesPath, 'tsd');
  symlinkDirectory(tsdModuleSourcePath, tsdModuleDestinationPath, 'tsd module');

  fs.mkdirSync(context.paths.tsdTestsGiteaNamespacePath, { recursive: true });
  symlinkDirectory(context.paths.outputDir, context.paths.tsdTestsGiteaSymlinkPath, '@gitea/dotfiles package');
}
