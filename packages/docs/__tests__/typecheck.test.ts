import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { $ } from "bun";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { typecheckDocs } from "../typecheck";
import { prepareDocsWorkspace } from "../workspace";
import { cleanupDir } from "./helpers";

const SCRATCH = process.env.TMPDIR ?? path.resolve(import.meta.dir, "../../../.tmp");
const OUTPUTS = [".astro/developer.txt", "dist/index.html", "src/content/docs/developer.md", "public/install.sh"];
let root: string;
let docsDir: string;

beforeEach(async () => {
  fs.mkdirSync(SCRATCH, { recursive: true });
  root = fs.mkdtempSync(path.join(SCRATCH, "docs-typecheck-test-"));
  docsDir = await prepareDocsWorkspace(root);
  for (const file of OUTPUTS) {
    await Bun.write(path.join(docsDir, file), `developer output: ${file}`);
  }
});

afterEach(() => cleanupDir(root));

describe("docs typechecking", () => {
  test("checks valid sources without replacing generated output", async () => {
    const before = fs.readdirSync(SCRATCH).sort();
    await typecheckDocs(docsDir);
    for (const file of OUTPUTS) {
      expect(await Bun.file(path.join(docsDir, file)).text()).toBe(`developer output: ${file}`);
    }
    expect(fs.readdirSync(SCRATCH).sort()).toEqual(before);
  }, 30_000);

  test("reports invalid sources and cleans up without replacing generated output", async () => {
    await Bun.write(path.join(docsDir, "invalid.ts"), 'export const value: number = "wrong type";');
    const before = fs.readdirSync(SCRATCH).sort();
    let diagnostic = "";
    try {
      await typecheckDocs(docsDir);
    } catch (error) {
      assert(error instanceof $.ShellError);
      diagnostic = error.stdout.toString();
    }
    expect(diagnostic).toContain("invalid.ts");
    expect(diagnostic).toContain("TS2322");
    for (const file of OUTPUTS) {
      expect(await Bun.file(path.join(docsDir, file)).text()).toBe(`developer output: ${file}`);
    }
    expect(fs.readdirSync(SCRATCH).sort()).toEqual(before);
  }, 30_000);
});
