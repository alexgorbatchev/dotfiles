import fs from 'node:fs';

import { BuildError } from '../handleBuildError';
import type { IBuildContext } from '../types';

/**
 * Validates that the generated schema types include the expected ProjectConfig definition.
 * This performs a simple content check rather than full type resolution to avoid
 * issues with the TypeScript compiler API not being able to resolve external modules.
 */
export function checkProjectConfigTypeSignature(context: IBuildContext): void {
  const schemaContent: string = fs.readFileSync(context.paths.outputSchemasDtsPath, 'utf-8');

  // Verify the file imports zod
  if (!schemaContent.includes("import { z } from 'zod'")) {
    throw new BuildError('Generated schema is missing zod import');
  }

  // Verify ProjectConfig type alias exists and references the schema
  if (!schemaContent.includes('type ProjectConfig = z.infer<typeof projectConfigSchema>')) {
    throw new BuildError('Generated schema is missing ProjectConfig type alias');
  }

  // Verify the schema includes generatedDir field
  if (
    !schemaContent.includes('generatedDir: z.ZodNonOptional<z.ZodDefault<z.ZodString>>') &&
    !schemaContent.includes('generatedDir: z.ZodDefault<z.ZodString>')
  ) {
    throw new BuildError('Generated schema is missing generatedDir field');
  }

  // Verify key exports are present
  const requiredExports: string[] = ['defineTool', 'defineConfig', 'dedentString', 'dedentTemplate'];
  for (const exportName of requiredExports) {
    if (!schemaContent.includes(exportName)) {
      throw new BuildError(`Generated schema is missing required export: ${exportName}`);
    }
  }
}
