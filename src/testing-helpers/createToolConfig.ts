/**
 * @fileoverview Helper functions for creating tool configuration files in tests.
 */

import * as fs from 'node:fs';
import * as path from 'path';

/**
 * Options for creating a tool configuration
 */
export interface ToolConfigOptions {
  /** Directory to create tool config in */
  toolConfigsDir: string;
  /** Tool name */
  name: string;
  /** Tool config content (not needed if fixturePath is provided) */
  content?: string;
  /** Path to a fixture file to copy (alternative to providing content directly) */
  fixturePath?: string;
  /** Whether to adjust import paths in the fixture file (default: true) */
  adjustImportPaths?: boolean;
}

/**
 * Creates a tool configuration file
 *
 * @param options - Options for creating the tool config
 * @returns Path to the created config file
 */
export function createToolConfig(options: ToolConfigOptions): string {
  const { toolConfigsDir, name, content, fixturePath, adjustImportPaths = true } = options;
  
  // Create tool config file
  const configPath = path.join(toolConfigsDir, `${name}.tool.ts`);
  
  // Determine the content to write
  let fileContent: string;
  
  if (fixturePath) {
    // Read content from fixture file
    if (!fs.existsSync(fixturePath)) {
      throw new Error(`Fixture file not found: ${fixturePath}`);
    }
    
    fileContent = fs.readFileSync(fixturePath, 'utf-8');
    
    // Adjust import paths if needed
    if (adjustImportPaths) {
      // TODO this replacement is probably unnecessary
      fileContent = fileContent.replace(
        /from ('|")@types('|")/g,
        'from $1../../../../../types$2'
      );
    }
  } else if (content) {
    // Use provided content directly
    fileContent = content;
  } else {
    throw new Error('Either content or fixturePath must be provided');
  }
  
  // Write the content to the target file
  fs.writeFileSync(configPath, fileContent);

  return configPath;
}