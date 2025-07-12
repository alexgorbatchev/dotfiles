import * as path from 'node:path';
import type { IFileSystem } from '@modules/file-system';

/**
 * Creates a file with the specified content. Optionally, the file can be made executable.
 *
 * @param filePath - The path where the binary file should be created
 * @param content - The content to write to the binary file
 * @param executable - Whether the binary file should be made executable (default: true)
 * @returns The path to the created binary file
 */
export async function createFile(
  fs: IFileSystem,
  filePath: string,
  content: string,
  executable = false
): Promise<string> {
  const dirPath = path.dirname(filePath);
  await fs.ensureDir(dirPath);

  await fs.writeFile(filePath, content);
  if (executable) {
    await fs.chmod(filePath, 0o755);
  }

  return filePath;
}
