import fs from 'node:fs';
import type { ToolConfig } from '@dotfiles/core';
import { generateToolTypesContent, getBuiltPackageName } from '@dotfiles/utils';

/**
 * Generates and writes the tool-types.d.ts file using Node.js fs (for build script).
 * Uses the built package name (@gitea/dotfiles) for the module declaration.
 *
 * @param toolConfigs - Record of loaded tool configurations
 * @param outputPath - Path where the tool-types.d.ts file should be written
 */
export function generateToolTypes(toolConfigs: Record<string, ToolConfig>, outputPath: string): void {
  const content: string = generateToolTypesContent(toolConfigs, getBuiltPackageName());
  fs.writeFileSync(outputPath, content, 'utf8');
}
