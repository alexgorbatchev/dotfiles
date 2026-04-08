import { describe, expect, it } from "bun:test";
import fs from "node:fs";

const CANONICAL_TILDE_EXPANSION_FILES: readonly string[] = [
  "packages/file-system/src/ResolvedFileSystem.ts",
  "packages/utils/src/expandHomePath.ts",
  "packages/cli/src/resolveConfigPath.ts",
  "packages/config/src/stagedProjectConfigLoader.ts",
] as const;

describe("tilde-expansion-guardrails", () => {
  it("canonical tilde expansion files should exist", () => {
    for (const file of CANONICAL_TILDE_EXPANSION_FILES) {
      const exists = fs.existsSync(file);
      expect(exists).toBe(true);
    }
  });

  it("should verify canonical files implement tilde expansion logic", () => {
    // Check that ResolvedFileSystem delegates home expansion to expandHomePath
    const resolvedFsContent = fs.readFileSync("packages/file-system/src/ResolvedFileSystem.ts", "utf8");
    expect(resolvedFsContent).toContain("from '@dotfiles/utils'");
    expect(resolvedFsContent).toContain("expandHomePath");

    // Check that expandHomePath handles tilde expansion
    const expandHomeContent = fs.readFileSync("packages/utils/src/expandHomePath.ts", "utf8");
    expect(expandHomeContent).toContain("export function expandHomePath");
    expect(expandHomeContent).toContain("path.startsWith('~\\\\')");
  });
});
