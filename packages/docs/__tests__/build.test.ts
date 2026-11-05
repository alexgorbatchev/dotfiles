import fs from "node:fs";
import path from "node:path";
import { $ } from "bun";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { prepareDocsWorkspace } from "../workspace";
import { cleanupDir, collectHrefs } from "./helpers";

const DOCS_DIR = path.resolve(import.meta.dir, "..");
let fixtureRoot: string;
let distDir: string;
const MARKDOWN_HREF_PATTERN = /\.md(?:#.*)?$/;
const BUILD_TIMEOUT_MS = 180_000;
// Starlight decorates every heading with a `.sl-anchor-link`; only the links written in the source count.
const CONTENT_LINK_SELECTOR = ".sl-markdown-content a:not(.sl-anchor-link)";

async function readPage(route: string): Promise<string> {
  return Bun.file(path.join(distDir, route, "index.html")).text();
}

describe("site build", () => {
  beforeAll(async () => {
    const scratch = process.env.TMPDIR ?? path.resolve(DOCS_DIR, "../../.tmp");
    fs.mkdirSync(scratch, { recursive: true });
    fixtureRoot = fs.mkdtempSync(path.join(scratch, "docs-build-"));
    const fixtureDocs = await prepareDocsWorkspace(fixtureRoot);
    distDir = path.join(fixtureDocs, "dist");
    await $`bun run build`
      .cwd(fixtureDocs)
      .env({ ...process.env, TMPDIR: fixtureRoot, NODE_COMPILE_CACHE: path.join(fixtureRoot, "node-compile-cache") })
      .quiet();
  }, BUILD_TIMEOUT_MS);

  afterAll(() => cleanupDir(fixtureRoot));

  test("leaves no markdown hrefs in any built page", async () => {
    const markdownHrefs: string[] = [];

    for await (const file of new Bun.Glob("**/index.html").scan({ cwd: distDir })) {
      const hrefs = await collectHrefs(await Bun.file(path.join(distDir, file)).text(), "a[href]");
      markdownHrefs.push(...hrefs.filter((href) => MARKDOWN_HREF_PATTERN.test(href)).map((href) => `${file}: ${href}`));
    }

    expect(markdownHrefs).toEqual([]);
  });

  test("rewrites a parent-relative link with a fragment", async () => {
    const hrefs = await collectHrefs(await readPage("configuration/virtual-environments"), CONTENT_LINK_SELECTOR);

    expect(hrefs).toEqual(["/dotfiles/getting-started/cli-reference/#dotfiles-venv"]);
  });

  test("rewrites a parent-relative link to another section", async () => {
    const hrefs = await collectHrefs(await readPage("installation-methods/manual"), CONTENT_LINK_SELECTOR);

    expect(hrefs).toEqual([
      "/dotfiles/installation-methods/curl-script/#scripts-that-install-themselves",
      "#binarypath-resolution",
      "/dotfiles/api-reference/core-api/#binary-patterns",
      "/dotfiles/installation-methods/curl-script/#scripts-that-install-themselves",
      "/dotfiles/api-reference/lifecycle-hooks/",
    ]);
  });

  test("rewrites current-directory and parent-relative links on the same page", async () => {
    const hrefs = await collectHrefs(await readPage("configuration/common-patterns"), CONTENT_LINK_SELECTOR);

    expect(hrefs).toEqual([
      "/dotfiles/installation-methods/overview/",
      "/dotfiles/configuration/getting-started/",
      "/dotfiles/configuration/project-configuration/",
      "/dotfiles/make-tool/",
    ]);
  });
});
