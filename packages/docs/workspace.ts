import fs from "node:fs";
import path from "node:path";

/** Copy build inputs while keeping generated content and Astro caches fixture-owned. */
export async function prepareDocsWorkspace(root: string, docsDir = import.meta.dir): Promise<string> {
  const repoRoot = path.resolve(docsDir, "../..");
  const fixtureDocs = path.join(root, "packages/docs");
  const excluded = new Set(["node_modules", "dist", ".astro", "src/content/docs"]);
  fs.cpSync(docsDir, fixtureDocs, {
    recursive: true,
    filter: (source) => !excluded.has(path.relative(docsDir, source).split(path.sep).join("/")),
  });
  fs.cpSync(
    fs.realpathSync(path.join(repoRoot, ".agents/skills/dotfiles")),
    path.join(root, ".agents/skills/dotfiles"),
    {
      recursive: true,
    },
  );
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
  fs.symlinkSync(path.join(repoRoot, "node_modules"), path.join(root, "node_modules"), "junction");
  return fixtureDocs;
}
