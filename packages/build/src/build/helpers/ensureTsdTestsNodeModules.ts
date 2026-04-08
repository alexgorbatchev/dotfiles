import fs from "node:fs";
import path from "node:path";

import type { IBuildContext } from "../types";
import { symlinkDirectory } from "./symlinkDirectory";

/**
 * Files from .dist that should be included in the dotfiles package.
 * Excludes tool-types.d.ts since end users receive it in .generated folder.
 */
const PACKAGE_FILES: string[] = ["cli.js", "cli.js.map", "package.json", "schemas.d.ts"];

/**
 * Prepares node_modules for the tsd tests project.
 * Mimics actual end user setup where tool-types.d.ts is NOT part of node_modules.
 */
export function ensureTsdTestsNodeModules(context: IBuildContext): void {
  fs.mkdirSync(context.paths.tsdTestsNodeModulesPath, { recursive: true });

  const tsdModuleSourcePath: string = path.join(context.paths.rootNodeModulesPath, "tsd");
  const tsdModuleDestinationPath: string = path.join(context.paths.tsdTestsNodeModulesPath, "tsd");
  symlinkDirectory(tsdModuleSourcePath, tsdModuleDestinationPath, "tsd module");

  // Copy only package files (excluding tool-types.d.ts) to mimic npm package
  fs.mkdirSync(context.paths.tsdTestsScopedNamespacePath, { recursive: true });
  fs.mkdirSync(context.paths.tsdTestsScopedPackagePath, { recursive: true });

  for (const fileName of PACKAGE_FILES) {
    const sourcePath: string = path.join(context.paths.outputDir, fileName);
    const destPath: string = path.join(context.paths.tsdTestsScopedPackagePath, fileName);

    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, destPath);
    }
  }

  // Copy docs directory if it exists
  const sourceDocsDir: string = path.join(context.paths.outputDir, "docs");
  const destDocsDir: string = path.join(context.paths.tsdTestsScopedPackagePath, "docs");

  if (fs.existsSync(sourceDocsDir)) {
    fs.cpSync(sourceDocsDir, destDocsDir, { recursive: true });
  }
}
