import fs from 'node:fs';
import path from 'node:path';
import { computeFileSizeKb } from '../helpers/computeFileSizeKb';
import type { IBuildContext } from '../types';

/**
 * Prints a human-friendly summary of build outputs, including generated file sizes.
 */
export async function printBuildSummary(context: IBuildContext): Promise<void> {
  console.log('✅ Build completed successfully!');
  console.log(`📁 Output directory: ${context.paths.outputDir}`);
  console.log('🗂️  Generated files:');

  const files: string[] = fs.readdirSync(context.paths.outputDir);

  for (const file of files.toSorted()) {
    const filePath: string = path.join(context.paths.outputDir, file);
    const relativePath: string = path.relative(context.paths.rootDir, filePath);
    const stats = fs.statSync(filePath);

    if (stats.isFile()) {
      const kb: number = computeFileSizeKb(stats.size);
      console.log(`  - ${relativePath} (${kb} KB)`);
    }
  }
}
