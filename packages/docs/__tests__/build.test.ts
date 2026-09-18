import path from "node:path";
import { $ } from "bun";
import { beforeAll, describe, expect, test } from "bun:test";

import { collectHrefs } from "./helpers";

const DOCS_DIR = path.resolve(import.meta.dir, "..");
const DIST_DIR = path.join(DOCS_DIR, "dist");
const MARKDOWN_HREF_PATTERN = /\.md(?:#.*)?$/;
const BUILD_TIMEOUT_MS = 180_000;
// Starlight decorates every heading with a `.sl-anchor-link`; only the links written in the source count.
const CONTENT_LINK_SELECTOR = ".sl-markdown-content a:not(.sl-anchor-link)";

async function readPage(route: string): Promise<string> {
  return Bun.file(path.join(DIST_DIR, route, "index.html")).text();
}

describe("site build", () => {
  beforeAll(async () => {
    await $`bun run build`.cwd(DOCS_DIR).quiet();
  }, BUILD_TIMEOUT_MS);

  test("leaves no markdown hrefs in any built page", async () => {
    const markdownHrefs: string[] = [];

    for await (const file of new Bun.Glob("**/index.html").scan({ cwd: DIST_DIR })) {
      const hrefs = await collectHrefs(await Bun.file(path.join(DIST_DIR, file)).text(), "a[href]");
      markdownHrefs.push(...hrefs.filter((href) => MARKDOWN_HREF_PATTERN.test(href)).map((href) => `${file}: ${href}`));
    }

    expect(markdownHrefs).toEqual([]);
  });

  test("rewrites a parent-relative link with a fragment", async () => {
    const hrefs = await collectHrefs(await readPage("configuration/virtual-environments"), CONTENT_LINK_SELECTOR);

    expect(hrefs).toEqual(["/dotfiles/getting-started/cli-reference/#dotfiles-env"]);
  });

  test("rewrites a parent-relative link to another section", async () => {
    const hrefs = await collectHrefs(await readPage("installation-methods/manual"), CONTENT_LINK_SELECTOR);

    expect(hrefs).toEqual(["/dotfiles/api-reference/lifecycle-hooks/"]);
  });

  test("rewrites current-directory and parent-relative links on the same page", async () => {
    const hrefs = await collectHrefs(await readPage("configuration/common-patterns"), CONTENT_LINK_SELECTOR);

    expect(hrefs).toEqual([
      "/dotfiles/configuration/getting-started/",
      "/dotfiles/configuration/project-configuration/",
      "/dotfiles/make-tool/",
    ]);
  });
});
