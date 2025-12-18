import path from 'node:path';
import { generateToolTypes } from '../generateToolTypes';
import type { IBuildContext } from '../types';

/**
 * Emits the tool type declarations file into the build output directory.
 */
export function generateToolTypesFile(context: IBuildContext): void {
  generateToolTypes({}, path.join(context.paths.outputDir, 'tool-types.d.ts'));
}
