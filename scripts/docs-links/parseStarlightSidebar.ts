import type { IStarlightSidebar, IStarlightSidebarEntry } from "./types";

const LINE_COMMENT = /^\s*\/\//;
const SIDEBAR_LINK = /\blink\s*:\s*(["'])([^"']*)\1/g;
const SIDEBAR_SLUG = /\bslug\s*:\s*(["'])([^"']*)\1/g;
const SIDEBAR_AUTOGENERATE_DIRECTORY = /\bautogenerate\s*:\s*\{[^}]*\bdirectory\s*:\s*(["'])([^"']*)\1/g;

function collect(
  line: string,
  lineNumber: number,
  pattern: RegExp,
  kind: IStarlightSidebarEntry["kind"],
  entries: IStarlightSidebarEntry[],
): void {
  for (const match of line.matchAll(pattern)) {
    const value = match[2];
    if (value !== undefined) entries.push({ kind, line: lineNumber, value });
  }
}

/**
 * Pull the page-selecting parts of a Starlight `sidebar` configuration out of the Astro config
 * source. Starlight resolves the sidebar inside its integration hook, so the values are not
 * reachable by importing the config; reading the source is the only way to see them from outside.
 */
export function parseStarlightSidebar(file: string, source: string): IStarlightSidebar {
  const entries: IStarlightSidebarEntry[] = [];
  source.split(/\r?\n/).forEach((line, index) => {
    if (LINE_COMMENT.test(line)) return;
    collect(line, index + 1, SIDEBAR_LINK, "link", entries);
    collect(line, index + 1, SIDEBAR_SLUG, "slug", entries);
    collect(line, index + 1, SIDEBAR_AUTOGENERATE_DIRECTORY, "autogenerate", entries);
  });
  return { file, entries };
}
