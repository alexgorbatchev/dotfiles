import fs from "node:fs";
import path from "node:path";

import { BuildError } from "../handleBuildError";

function resolveNestedDtsPath(tempSchemasBuildDir: string, fileName: string): string {
  return path.join(tempSchemasBuildDir, "packages", "cli", "src", fileName);
}

function findFilesByNameRecursive(startDir: string, fileName: string): string[] {
  const stack: string[] = [startDir];
  const matches: string[] = [];

  while (stack.length > 0) {
    const dirPath: string | undefined = stack.pop();
    if (!dirPath) {
      continue;
    }

    const entries: fs.Dirent[] = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath: string = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }

      if (entry.isFile() && entry.name === fileName) {
        matches.push(entryPath);
      }
    }
  }

  matches.sort((a, b) => a.localeCompare(b));
  return matches;
}

/**
 * Locates the generated schema-exports.d.ts file within the temporary schema build directory.
 */
export function resolveSchemaExportsDtsPath(tempSchemasBuildDir: string): string {
  return resolveGeneratedDtsPath(tempSchemasBuildDir, "schema-exports.d.ts");
}

export function resolveAuthoringExportsDtsPath(tempSchemasBuildDir: string): string {
  return resolveGeneratedDtsPath(tempSchemasBuildDir, "authoring-exports.d.ts");
}

function resolveGeneratedDtsPath(tempSchemasBuildDir: string, fileName: string): string {
  const directPath: string = path.join(tempSchemasBuildDir, fileName);
  if (fs.existsSync(directPath)) {
    return directPath;
  }

  const nestedPath: string = resolveNestedDtsPath(tempSchemasBuildDir, fileName);
  if (fs.existsSync(nestedPath)) {
    return nestedPath;
  }

  const matches: string[] = findFilesByNameRecursive(tempSchemasBuildDir, fileName);

  if (matches.length === 1) {
    const match: string | undefined = matches[0];
    if (!match) {
      throw new BuildError("schema-exports.d.ts was found but could not be read");
    }
    return match;
  }

  if (matches.length === 0) {
    throw new BuildError(`${fileName} was not generated`);
  }

  throw new BuildError(`Multiple ${fileName} files found: ${matches.join(", ")}`);
}
