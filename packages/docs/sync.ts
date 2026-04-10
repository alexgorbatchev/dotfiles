import { $ } from "bun";
import fs from "node:fs";
import path from "node:path";

const sourceDir = path.resolve(import.meta.dir, "../../.agents/skills/dotfiles");
const destDir = path.resolve(import.meta.dir, "src/content/docs");

// Clean and recreate destination
await $`rm -rf ${destDir}/*`.quiet();
await $`mkdir -p ${destDir}`.quiet();

// Copy all files from skills references
await $`cp -R ${sourceDir}/references/ ${destDir}/`.quiet();

// Copy the root README.md to be the index page
const rootReadmePath = path.resolve(import.meta.dir, "../../README.md");
const indexPath = path.join(destDir, "index.md");
let indexContent = fs.readFileSync(rootReadmePath, "utf8");

// Parse H1 from the root readme
const rootH1Match = indexContent.match(/^#\s+(.+)$/m);
const indexTitle = rootH1Match ? rootH1Match[1] : "Documentation";
if (rootH1Match) {
  indexContent = indexContent.replace(/^#\s+(.+)$\n*/m, "");
}
indexContent = `---\ntitle: "${indexTitle.replace(/"/g, '\\"')}"\n---\n\n` + indexContent;
fs.writeFileSync(indexPath, indexContent);

// Add title to references if missing
const files = new Bun.Glob("**/*.md").scanSync({ cwd: destDir });
for (const file of files) {
  if (file === "index.md") continue;

  const filePath = path.join(destDir, file);
  let content = fs.readFileSync(filePath, "utf8");
  if (!content.startsWith("---")) {
    // try to find first h1
    const h1Match = content.match(/^#\s+(.+)$/m);
    const title = h1Match ? h1Match[1] : path.basename(file, ".md");
    if (h1Match) {
      content = content.replace(/^#\s+(.+)$\n*/m, "");
    }
    content = `---\ntitle: ${title}\n---\n\n` + content;
    fs.writeFileSync(filePath, content);
  } else if (!content.match(/^title:/m)) {
    const h1Match = content.match(/^#\s+(.+)$/m);
    const title = h1Match ? h1Match[1] : path.basename(file, ".md");
    if (h1Match) {
      content = content.replace(/^#\s+(.+)$\n*/m, "");
    }
    content = content.replace(/^---/, `---\ntitle: ${title}`);
    fs.writeFileSync(filePath, content);
  } else {
    const h1Match = content.match(/^#\s+(.+)$/m);
    if (h1Match) {
      content = content.replace(/^#\s+(.+)$\n*/m, "");
      fs.writeFileSync(filePath, content);
    }
  }
}
