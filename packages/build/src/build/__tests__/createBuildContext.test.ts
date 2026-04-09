import { describe, expect, test } from "bun:test";
import path from "node:path";
import { createBuildContext } from "../helpers/createBuildContext";

describe("createBuildContext", () => {
  test("uses .agents skills as the packaged skill source", () => {
    const context = createBuildContext();
    const expectedSkillDir = path.join(context.paths.rootDir, ".agents", "skills", "dotfiles");

    expect(context.paths.skillDir).toBe(expectedSkillDir);
  });
});
