import fs from 'node:fs';
import type { ToolConfig } from '@dotfiles/core';
import { generateToolTypesContent } from '@dotfiles/utils';

/**
 * Generates and writes the tool-types.d.ts file using Node.js fs (for build script).
 *
 * @param toolConfigs - Record of loaded tool configurations
 * @param outputPath - Path where the tool-types.d.ts file should be written
 */
export function generateToolTypes(toolConfigs: Record<string, ToolConfig>, outputPath: string): void {
  const content: string = generateToolTypesContent(toolConfigs);
  fs.writeFileSync(outputPath, content, 'utf8');
}
