import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { $ } from "bun";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { cleanupDir } from "./helpers";

const DOCS_DIR = path.resolve(import.meta.dir, "..");
const REPO_ROOT = path.resolve(DOCS_DIR, "../..");
const CANONICAL_REFERENCES_DIR = path.join(REPO_ROOT, ".agents/skills/dotfiles/references");

describe("documentation sync", () => {
  let tmpDir: string;

  beforeAll(async () => {
    const tmpBase = path.join(REPO_ROOT, ".tmp");
    fs.mkdirSync(tmpBase, { recursive: true });
    tmpDir = fs.mkdtempSync(path.join(tmpBase, "docs-sync-test-"));
    await $`bun ${path.join(DOCS_DIR, "sync.ts")}`
      .env({
        ...process.env,
        DOCS_DEST_DIR: tmpDir,
      })
      .quiet();
  });

  afterAll(() => {
    cleanupDir(tmpDir);
  });

  test("content docs contains every reference from canonical skill", () => {
    const canonicalFiles = Array.from(new Bun.Glob("**/*.md").scanSync({ cwd: CANONICAL_REFERENCES_DIR })).sort();

    expect(canonicalFiles.length).toBeGreaterThan(0);

    for (const relFile of canonicalFiles) {
      const destPath = path.join(tmpDir, relFile);
      expect(fs.existsSync(destPath)).toBe(true);
    }
  });

  test("content docs contains no extra or orphaned files", () => {
    const contentFiles = Array.from(new Bun.Glob("**/*").scanSync({ cwd: tmpDir }))
      .filter((file) => !fs.statSync(path.join(tmpDir, file)).isDirectory())
      .filter((file) => file !== "index.md" && file !== ".gitkeep" && file !== "install.sh")
      .sort();

    for (const relFile of contentFiles) {
      const canonicalPath = path.join(CANONICAL_REFERENCES_DIR, relFile);
      expect(fs.existsSync(canonicalPath)).toBe(true);
    }

    const canonicalFiles = Array.from(new Bun.Glob("**/*.md").scanSync({ cwd: CANONICAL_REFERENCES_DIR })).sort();
    expect(contentFiles).toEqual(canonicalFiles);
  });

  test("content docs matches canonical skill references content", () => {
    const canonicalFiles = Array.from(new Bun.Glob("**/*.md").scanSync({ cwd: CANONICAL_REFERENCES_DIR }));

    for (const relFile of canonicalFiles) {
      const canonicalContent = fs.readFileSync(path.join(CANONICAL_REFERENCES_DIR, relFile), "utf8");
      const docContent = fs.readFileSync(path.join(tmpDir, relFile), "utf8");

      // sync.ts adds frontmatter (title) and strips the first H1 heading.
      // After stripping frontmatter from doc and leading H1 from canonical, bodies must match.
      const docBody = docContent.replace(/^---[\s\S]*?---\n*/, "").trim();
      const canonicalBody = canonicalContent
        .replace(/^---[\s\S]*?---\n*/, "")
        .replace(/^#\s+(.+)$\n*/m, "")
        .trim();

      expect(docBody).toBe(canonicalBody);
    }
  });

  test("cli-reference includes the tool add command documentation", () => {
    const cliRefPath = path.join(tmpDir, "getting-started/cli-reference.md");
    const content = fs.readFileSync(cliRefPath, "utf8");
    expect(content).toContain("dotfiles tool add");
  });

  test("creates install.sh and index.md in output directory", () => {
    const installerPath = path.join(tmpDir, "install.sh");
    expect(fs.existsSync(installerPath)).toBe(true);
    const expectedInstaller = fs.readFileSync(path.join(REPO_ROOT, "scripts/managed-installer/install.sh"), "utf8");
    expect(fs.readFileSync(installerPath, "utf8")).toBe(expectedInstaller);

    const indexPath = path.join(tmpDir, "index.md");
    expect(fs.existsSync(indexPath)).toBe(true);
    const indexContent = fs.readFileSync(indexPath, "utf8");

    const rootReadme = fs.readFileSync(path.join(REPO_ROOT, "README.md"), "utf8");
    const rootH1Match = rootReadme.match(/^#\s+(.+)$/m);
    assert(rootH1Match !== null);
    const expectedTitle = rootH1Match[1];
    expect(indexContent).toMatch(new RegExp(`^---\\ntitle: "${expectedTitle}"\\n---`));

    const expectedBody = rootReadme.replace(/^#\s+(.+)$\n*/m, "").trim();
    const actualBody = indexContent.replace(/^---[\s\S]*?---\n*/, "").trim();
    expect(actualBody).toBe(expectedBody);
  });
});
