import fs from "node:fs";
import path from "node:path";
import { $ } from "bun";

import { prepareDocsWorkspace } from "./workspace";

/** Check the real docs sources without rewriting their generated content or caches. */
export async function typecheckDocs(docsDir = import.meta.dir): Promise<void> {
  const scratch = process.env.TMPDIR ?? path.resolve(docsDir, "../../.tmp");
  fs.mkdirSync(scratch, { recursive: true });
  const root = fs.mkdtempSync(path.join(scratch, "docs-check-"));
  try {
    const workspace = await prepareDocsWorkspace(root, docsDir);
    const env = { ...process.env, TMPDIR: root, NODE_COMPILE_CACHE: path.join(root, "node-compile-cache") };
    await $`bun sync.ts`.cwd(workspace).env(env).quiet();
    await $`./node_modules/.bin/astro sync`.cwd(workspace).env(env).quiet();
    await $`../../node_modules/.bin/tsc -p tsconfig.json`.cwd(workspace).env(env).quiet();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  await typecheckDocs();
}
