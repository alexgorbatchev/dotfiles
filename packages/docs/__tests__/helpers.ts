import fs from "node:fs";
import path from "node:path";

/** Copy build inputs while keeping generated content and Astro caches fixture-owned. */
export async function prepareBuildFixture(root: string): Promise<string> {
  const docsDir = path.resolve(import.meta.dir, "..");
  const repoRoot = path.resolve(docsDir, "../..");
  const fixtureDocs = path.join(root, "packages/docs");
  const excluded = new Set(["node_modules", "dist", ".astro", "src/content/docs"]);
  fs.cpSync(docsDir, fixtureDocs, {
    recursive: true,
    filter: (source) => !excluded.has(path.relative(docsDir, source).split(path.sep).join("/")),
  });
  fs.cpSync(path.join(repoRoot, "pkg/embedded/skill"), path.join(root, ".agents/skills/dotfiles"), {
    recursive: true,
  });
  fs.cpSync(path.join(repoRoot, "scripts/docs-links"), path.join(root, "scripts/docs-links"), {
    recursive: true,
  });
  for (const file of ["README.md", "scripts/check-docs-links.ts", "scripts/managed-installer/install.sh"]) {
    await Bun.write(path.join(root, file), Bun.file(path.join(repoRoot, file)));
  }
  // A real node_modules directory keeps Astro's default .astro cache local.
  // Only installed dependencies are shared with the checkout.
  const modules = path.join(fixtureDocs, "node_modules");
  fs.mkdirSync(modules, { recursive: true });
  for (const entry of fs.readdirSync(path.join(docsDir, "node_modules"))) {
    if (!entry.startsWith(".") || entry === ".bin") {
      fs.symlinkSync(path.join(docsDir, "node_modules", entry), path.join(modules, entry), "junction");
    }
  }
  return fixtureDocs;
}

/** Removes a temporary directory if it was created. */
export function cleanupDir(dir?: string): void {
  if (dir) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Collects the `href` of every element matched by `selector`, in document order. */
export async function collectHrefs(html: string, selector: string): Promise<string[]> {
  const hrefs: string[] = [];
  const rewriter = new HTMLRewriter().on(selector, {
    element(element) {
      const href = element.getAttribute("href");
      if (href !== null) {
        hrefs.push(href);
      }
    },
  });

  await rewriter.transform(new Response(html)).text();

  return hrefs;
}
