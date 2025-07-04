/**
 * @file generator/src/testing-helpers/createBinFile.ts
 * @description Helper function to create executable binary files for testing.
 *
 * ### Overview
 * This function creates an executable binary file with the specified content
 * and sets the appropriate permissions (chmod 755).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Creates an executable binary file with the specified content.
 *
 * @param filePath - The path where the binary file should be created
 * @param content - The content to write to the binary file
 * @returns The path to the created binary file
 */
export function createBinFile(filePath: string, content: string): string {
  // Ensure the directory exists
  const dirPath = path.dirname(filePath);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  
  // Write the file
  fs.writeFileSync(filePath, content);
  
  // Make it executable (chmod 755)
  fs.chmodSync(filePath, 0o755);
  
  return filePath;
}