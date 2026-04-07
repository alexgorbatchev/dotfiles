import path from 'node:path';

import type { IBuildContext } from '../types';

/**
 * Creates the entrypoint typings file used by the tsd test project.
 */
export async function createTsdTestsEntryPoint(context: IBuildContext): Promise<void> {
  const entryPoint: string = "export * from '@alexgorbatchev/dotfiles';\n";
  await Bun.write(path.join(context.paths.tsdTestsDir, 'index.d.ts'), entryPoint);
}
