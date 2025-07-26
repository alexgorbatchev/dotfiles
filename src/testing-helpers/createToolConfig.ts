import * as fs from 'node:fs';
import * as path from 'path';

/**
 * Options for creating a tool configuration.
 */
export interface ToolConfigOptions {
  /**
   * Directory to create tool config in.
   */
  toolConfigsDir: string;
  /**
   * Tool name.
   */
  name: string;
  /**
   * Tool config content (not needed if fixturePath is provided).
   */
  content?: string;
  /**
   * Path to a fixture file to copy (alternative to providing content directly).
   */
  fixturePath?: string;
}

/**
 * Creates a tool configuration file.
 *
 * @param options - Options for creating the tool config.
 * @returns Path to the created config file.
 */
export function createToolConfig(options: ToolConfigOptions): string {
  const { toolConfigsDir, name, content, fixturePath } = options;

  const configPath = path.join(toolConfigsDir, `${name}.tool.ts`);

  let fileContent: string;

  if (fixturePath) {
    if (!fs.existsSync(fixturePath)) {
      throw new Error(`Fixture file not found: ${fixturePath}`);
    }

    fileContent = fs.readFileSync(fixturePath, 'utf-8');
  } else if (content) {
    fileContent = content;
  } else {
    throw new Error('Either content or fixturePath must be provided');
  }

  fs.writeFileSync(configPath, fileContent);

  return configPath;
}