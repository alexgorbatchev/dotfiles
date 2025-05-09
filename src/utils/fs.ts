import fsPromises from 'node:fs/promises';
import fsSync from 'node:fs'; // For existsSync
import path from 'node:path';
import type { Volume, IFs } from 'memfs'; // Import Volume class and IFs instance type

// Define the interface for our file system abstraction
export interface FileSystem {
  exists(filePath: string): Promise<boolean>;
  readFile(filePath: string): Promise<string>;
  writeFile(filePath: string, content: string): Promise<void>;
  remove(filePath: string): Promise<void>;
  mkdir(dirPath: string): Promise<void>;
  isDirectory(filePath: string): Promise<boolean>;
  symlink(target: string, linkPath: string): Promise<void>;
  // Potentially add other methods like readdir, stat, lstat etc. if needed
}

// Implementation using Node's native fs/promises
const nodeFs: FileSystem = {
  exists: async (filePath: string): Promise<boolean> => {
    try {
      await fsPromises.access(filePath);
      return true;
    } catch {
      return false;
    }
  },
  readFile: (filePath: string): Promise<string> => {
    return fsPromises.readFile(filePath, 'utf-8');
  },
  writeFile: async (filePath: string, content: string): Promise<void> => {
    // Ensure the directory exists before writing
    const dir = path.dirname(filePath);
    await fsPromises.mkdir(dir, { recursive: true });
    await fsPromises.writeFile(filePath, content, 'utf-8');
  },
  remove: (filePath: string): Promise<void> => {
    // Use rm with recursive option to handle files and directories
    return fsPromises.rm(filePath, { recursive: true, force: true });
  },
  mkdir: async (dirPath: string): Promise<void> => {
    // recursive: true prevents errors if the directory already exists
    await fsPromises.mkdir(dirPath, { recursive: true });
    // Explicitly return nothing to match Promise<void>
  },
  isDirectory: async (filePath: string): Promise<boolean> => {
    try {
      const stats = await fsPromises.stat(filePath);
      return stats.isDirectory();
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return false; // Path doesn't exist
      }
      throw error; // Re-throw other errors
    }
  },
  symlink: (target: string, linkPath: string): Promise<void> => {
    // Note: On Windows, symlink creation might require specific privileges.
    // type argument might be needed ('file', 'dir', 'junction') depending on target.
    // For simplicity, assuming 'file' type for now. Adjust if needed.
    return fsPromises.symlink(target, linkPath, 'file');
  },
};

/**
 * Creates a FileSystem instance.
 * If a memfs volume is provided, it wraps the volume.
 * Otherwise, it returns an instance using Node's native fs.
 * @param volume Optional memfs Volume instance (represented by IFs type).
 * @returns A FileSystem implementation.
 */
export function createFs(volume?: IFs): FileSystem {
  // Accept IFs instance type
  if (volume) {
    // Create a wrapper for the memfs volume
    const memFsWrapper: FileSystem = {
      exists: async (filePath: string): Promise<boolean> => {
        // memfs doesn't have fs.access, use existsSync
        return volume.existsSync(filePath);
      },
      readFile: (filePath: string): Promise<string> => {
        return new Promise((resolve, reject) => {
          volume.readFile(filePath, 'utf-8', (err, data) => {
            if (err) reject(err);
            else resolve(data as string); // data can be Buffer | string
          });
        });
      },
      writeFile: async (filePath: string, content: string): Promise<void> => {
        const dir = path.dirname(filePath);
        // memfs mkdirSync is recursive by default if Volume instance is used
        volume.mkdirSync(dir, { recursive: true });
        return new Promise((resolve, reject) => {
          volume.writeFile(filePath, content, 'utf-8', (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      },
      remove: (filePath: string): Promise<void> => {
        return new Promise((resolve, reject) => {
          // Check if path exists before attempting removal
          if (!volume.existsSync(filePath)) {
            return reject(new Error(`ENOENT: no such file or directory, unlink '${filePath}'`));
          }
          // Use rmSync for simplicity, handles files/dirs recursively
          try {
            volume.rmSync(filePath, { recursive: true, force: true });
            resolve();
          } catch (err) {
            reject(err);
          }
        });
      },
      mkdir: (dirPath: string): Promise<void> => {
        return new Promise((resolve, reject) => {
          try {
            // recursive: true is default for memfs instance mkdirSync
            volume.mkdirSync(dirPath, { recursive: true });
            resolve();
          } catch (err) {
            reject(err);
          }
        });
      },
      isDirectory: async (filePath: string): Promise<boolean> => {
        try {
          const stats = volume.statSync(filePath);
          return stats.isDirectory();
        } catch (error: any) {
          if (error.code === 'ENOENT') {
            return false;
          }
          throw error;
        }
      },
      symlink: (target: string, linkPath: string): Promise<void> => {
        return new Promise((resolve, reject) => {
          volume.symlink(target, linkPath, 'file', (err) => {
            // Assuming 'file' type
            if (err) reject(err);
            else resolve();
          });
        });
      },
    };
    return memFsWrapper;
  } else {
    // Return the native Node FS implementation
    return nodeFs;
  }
}

// Export an instance using the native file system by default
export const fs: FileSystem = createFs();
