#!/usr/bin/env bun

/**
 * Documentation link check for the skill in `.agents/skills/dotfiles/`.
 *
 * Every relative link must resolve to a file, every `#anchor` must match a heading slug the way
 * the Starlight site computes it, and every published page must be reachable from SKILL.md or the
 * site sidebar. Problems print as `file:line: message` and the process exits non-zero.
 */

import path from "node:path";
import { Glob } from "bun";
import { checkDocsLinks } from "./docs-links/checkDocsLinks";
import { parseMarkdownDocument } from "./docs-links/parseMarkdownDocument";
import { parseStarlightSidebar } from "./docs-links/parseStarlightSidebar";
import type { IParsedMarkdownDocument } from "./docs-links/types";

const DOCS_ROOT = ".agents/skills/dotfiles";
const ENTRY_PAGE = "SKILL.md";
const PUBLISHED_DIRECTORY = "references";
const SIDEBAR_CONFIG = "packages/docs/astro.config.mjs";

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

async function main(): Promise<number> {
  const repoRoot = path.resolve(import.meta.dir, "..");
  const docsRootPath = path.join(repoRoot, DOCS_ROOT);
  const files = new Set<string>();
  const documents = new Map<string, IParsedMarkdownDocument>();

  const relativePaths: string[] = [];
  for await (const relativePath of new Glob("**/*").scan({ cwd: docsRootPath, onlyFiles: true })) {
    relativePaths.push(relativePath.split(path.sep).join("/"));
  }

  for (const relativePath of relativePaths.sort()) {
    const key = `${DOCS_ROOT}/${relativePath}`;
    files.add(key);
    if (!relativePath.endsWith(".md")) continue;
    documents.set(key, parseMarkdownDocument(await Bun.file(path.join(docsRootPath, relativePath)).text()));
  }

  const sidebar = parseStarlightSidebar(SIDEBAR_CONFIG, await Bun.file(path.join(repoRoot, SIDEBAR_CONFIG)).text());
  const { problems, summary } = checkDocsLinks({
    docsRoot: DOCS_ROOT,
    entryPage: ENTRY_PAGE,
    publishedDirectory: PUBLISHED_DIRECTORY,
    documents,
    files,
    sidebar,
  });

  for (const problem of problems) log(`${problem.file}:${problem.line}: ${problem.message}`);

  const scope = `${summary.pageCount} pages, ${summary.linkCount} links, ${summary.anchorCount} anchors`;
  if (problems.length > 0) {
    log(`\n${problems.length} documentation link problem(s) found (${scope}).`);
    return 1;
  }
  log(`Documentation links OK (${scope}).`);
  return 0;
}

process.exitCode = await main();
