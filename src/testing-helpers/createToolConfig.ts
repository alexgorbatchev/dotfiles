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
  /** Tool config content */
  content: string;
}

/**
 * Creates a tool configuration file
 *
 * @param options - Options for creating the tool config
 * @returns Path to the created config file
 */
export function createToolConfig(options: ToolConfigOptions): string {
  const { toolConfigsDir, name, content } = options;

  // Create tool config file
  const configPath = path.join(toolConfigsDir, `${name}.tool.ts`);
  fs.writeFileSync(configPath, content);

  return configPath;
}