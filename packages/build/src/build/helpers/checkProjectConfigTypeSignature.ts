import fs from 'node:fs';

import { extractTypeAliasSignature } from '../../extractTypeAliasSignature';
import { BuildError } from '../handleBuildError';
import type { IBuildContext } from '../types';

/**
 * Validates that the generated schema types include the expected ProjectConfig shape.
 */
export function checkProjectConfigTypeSignature(context: IBuildContext): void {
  const schemaTsconfig: Record<string, unknown> = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      types: [],
    },
    files: ['./schemas.d.ts'],
  };

  try {
    fs.writeFileSync(context.paths.schemaCheckTsconfigPath, JSON.stringify(schemaTsconfig, null, 2));
    const signature = extractTypeAliasSignature(
      context.paths.schemaCheckTsconfigPath,
      context.paths.outputSchemasDtsPath,
      'ProjectConfig',
    );

    if (!signature.includes('generatedDir: string')) {
      console.error('ℹ️ ProjectConfig appears to be invalid:');
      console.error(signature);
      throw new BuildError('ProjectConfig type extraction failed');
    }
  } finally {
    fs.rmSync(context.paths.schemaCheckTsconfigPath, { force: true });
  }
}
