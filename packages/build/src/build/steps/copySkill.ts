import fs from "node:fs";

import { copyDirectoryRecursive } from "../helpers/copyDirectoryRecursive";
import type { IBuildContext } from "../types";

/**
 * Copies the dotfiles skill folder into the build output so it can be shipped with the CLI.
 */
export function copySkill(context: IBuildContext): void {
  console.log("📚 Copying skill to build directory...");

  if (fs.existsSync(context.paths.skillDir)) {
    copyDirectoryRecursive(context.paths.skillDir, context.paths.outputSkillDir, []);
  }
}
