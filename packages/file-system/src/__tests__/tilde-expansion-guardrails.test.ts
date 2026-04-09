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
    const resolvedFsLines = fs
      .readFileSync("packages/file-system/src/ResolvedFileSystem.ts", "utf8")
      .split("\n")
      .map((line) => line.trim());

    expect(resolvedFsLines.includes('import { expandHomePath } from "@dotfiles/utils";')).toBe(true);
    expect(
      resolvedFsLines.includes("return this.inner.readFile(expandHomePath(this.homeDir, filePath), encoding);"),
    ).toBe(true);

    const expandHomeLines = fs
      .readFileSync("packages/utils/src/expandHomePath.ts", "utf8")
      .split("\n")
      .map((line) => line.trim());

    expect(expandHomeLines.includes("export function expandHomePath(homeDir: string, path: string): string {")).toBe(
      true,
    );
    expect(expandHomeLines.includes('if (path === "~" || path.startsWith("~/") || path.startsWith("~\\\\")) {')).toBe(
      true,
    );
    expect(expandHomeLines.includes("return path.replace(/^~(?=$|\\/|\\\\)/, homeDir);")).toBe(true);
  });
});
