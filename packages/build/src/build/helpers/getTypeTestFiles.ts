import fs from "node:fs";
import path from "node:path";
import type { IBuildContext, ITypeTestFile } from "../types";

/**
 * Discovers consolidated type test files under packages/build/type-tests.
 */
export function getTypeTestFiles(context: IBuildContext): ITypeTestFile[] {
  const typeTestsDir = path.join(context.paths.packagesDir, "build", "type-tests");
  const files: ITypeTestFile[] = [];

  const scanDir = (dir: string, category: string) => {
    if (!fs.existsSync(dir)) {
      return;
    }
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        scanDir(path.join(dir, entry.name), category + "/" + entry.name);
      } else if (entry.isFile() && entry.name.endsWith(context.constants.tsdTestFileExtension)) {
        files.push({
          packageName: category,
          fileName: entry.name,
          sourcePath: path.join(dir, entry.name),
        });
      }
    }
  };

  scanDir(path.join(typeTestsDir, "core"), "core");
  scanDir(path.join(typeTestsDir, "installers"), "installers");

  return files;
}
