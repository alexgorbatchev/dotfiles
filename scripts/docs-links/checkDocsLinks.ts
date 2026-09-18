import path from "node:path";
import type {
  IDocsLinkCheckInput,
  IDocsLinkCheckResult,
  IDocsLinkProblem,
  IMarkdownLink,
  IParsedMarkdownDocument,
  IStarlightSidebarEntry,
} from "./types";

const URL_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const PROTOCOL_RELATIVE = /^\/\//;

interface IResolvedTarget {
  /** Path keyed like `documents` and `files`, or undefined when the link has no path part. */
  filePath: string | undefined;
  fragment: string | undefined;
}

/** Either the resolved destination or the message explaining why it cannot be resolved. */
type TargetResolution = IResolvedTarget | string;

interface ILinkContext {
  input: IDocsLinkCheckInput;
  file: string;
  document: IParsedMarkdownDocument;
  problems: IDocsLinkProblem[];
  /** Pages this page links to; feeds the reachability walk. */
  outgoing: Set<string>;
  anchorCount: number;
}

function isExternal(target: string): boolean {
  return URL_SCHEME.test(target) || PROTOCOL_RELATIVE.test(target);
}

function resolveTarget(file: string, target: string): TargetResolution {
  const hashIndex = target.indexOf("#");
  const rawPath = hashIndex === -1 ? target : target.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? undefined : target.slice(hashIndex + 1);
  if (rawPath === "") return { filePath: undefined, fragment };

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    return `link destination "${target}" is not valid percent-encoding`;
  }
  if (decodedPath.startsWith("/")) {
    return `link destination "${target}" is absolute; the embedded skill and the website live at different roots, so use a path relative to this page`;
  }
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), decodedPath));
  return { filePath: resolved, fragment };
}

function isInsideDocsRoot(filePath: string, docsRoot: string): boolean {
  return filePath === docsRoot || filePath.startsWith(`${docsRoot}/`);
}

function checkFragment(
  context: ILinkContext,
  link: IMarkdownLink,
  target: IParsedMarkdownDocument,
  fragment: string,
  targetLabel: string,
): void {
  context.anchorCount += 1;
  let decodedFragment: string;
  try {
    decodedFragment = decodeURIComponent(fragment);
  } catch {
    context.problems.push({
      file: context.file,
      line: link.line,
      message: `anchor "#${fragment}" is not valid percent-encoding`,
    });
    return;
  }
  if (target.headings.some((heading) => heading.slug === decodedFragment)) return;
  if (target.titleHeading?.slug === decodedFragment) {
    context.problems.push({
      file: context.file,
      line: link.line,
      message: `anchor "#${fragment}" points at the page title of ${targetLabel}; the website turns the first heading into the page title and drops its anchor, so link to the page without a fragment`,
    });
    return;
  }
  context.problems.push({
    file: context.file,
    line: link.line,
    message: `anchor "#${fragment}" does not match any heading in ${targetLabel}`,
  });
}

function checkLink(context: ILinkContext, link: IMarkdownLink): void {
  const { input, file, document, problems } = context;
  if (link.target === "") {
    problems.push({ file, line: link.line, message: "link has an empty destination" });
    return;
  }
  if (isExternal(link.target)) return;

  const resolved = resolveTarget(file, link.target);
  if (typeof resolved === "string") {
    problems.push({ file, line: link.line, message: resolved });
    return;
  }

  if (resolved.filePath === undefined) {
    if (resolved.fragment === undefined || resolved.fragment === "") {
      problems.push({
        file,
        line: link.line,
        message: `link destination "${link.target}" has neither a path nor an anchor`,
      });
      return;
    }
    checkFragment(context, link, document, resolved.fragment, "this page");
    return;
  }

  if (!isInsideDocsRoot(resolved.filePath, input.docsRoot)) {
    problems.push({
      file,
      line: link.line,
      message: `link destination "${link.target}" resolves to ${resolved.filePath}, outside ${input.docsRoot}; the skill is shipped on its own, so pages must only link inside it`,
    });
    return;
  }

  const targetDocument = input.documents.get(resolved.filePath);
  if (targetDocument === undefined) {
    if (!input.files.has(resolved.filePath)) {
      problems.push({
        file,
        line: link.line,
        message: `link destination "${link.target}" does not exist (resolved to ${resolved.filePath})`,
      });
      return;
    }
    if (resolved.fragment !== undefined) {
      problems.push({
        file,
        line: link.line,
        message: `link destination "${link.target}" has an anchor, but ${resolved.filePath} is not a markdown page`,
      });
    }
    return;
  }

  context.outgoing.add(resolved.filePath);
  if (resolved.fragment !== undefined) {
    checkFragment(context, link, targetDocument, resolved.fragment, resolved.filePath);
  }
}

function sidebarPathToPages(input: IDocsLinkCheckInput, sitePath: string): string[] {
  const trimmed = sitePath.replaceAll(/^\/+|\/+$/g, "");
  if (trimmed === "") return [];
  const published = path.posix.join(input.docsRoot, input.publishedDirectory);
  return [`${published}/${trimmed}.md`, `${published}/${trimmed}/index.md`].filter((candidate) =>
    input.documents.has(candidate),
  );
}

function sidebarDirectoryToPages(input: IDocsLinkCheckInput, directory: string): string[] {
  const trimmed = directory.replaceAll(/^\/+|\/+$/g, "");
  const published = path.posix.join(input.docsRoot, input.publishedDirectory);
  const prefix = `${published}/${trimmed}/`;
  return [...input.documents.keys()].filter((page) => page === `${published}/${trimmed}.md` || page.startsWith(prefix));
}

function checkSidebarEntry(
  input: IDocsLinkCheckInput,
  entry: IStarlightSidebarEntry,
  problems: IDocsLinkProblem[],
): string[] {
  const { file } = input.sidebar;
  if (entry.kind === "autogenerate") {
    const pages = sidebarDirectoryToPages(input, entry.value);
    if (pages.length === 0) {
      problems.push({
        file,
        line: entry.line,
        message: `sidebar autogenerate directory "${entry.value}" contains no pages under ${input.publishedDirectory}/`,
      });
    }
    return pages;
  }
  const isSiteRoot = entry.kind === "link" && entry.value.replaceAll("/", "") === "";
  if (isSiteRoot || (entry.kind === "link" && isExternal(entry.value))) return [];
  const pages = sidebarPathToPages(input, entry.value);
  if (pages.length === 0) {
    problems.push({
      file,
      line: entry.line,
      message: `sidebar ${entry.kind} "${entry.value}" does not match any page under ${input.publishedDirectory}/`,
    });
  }
  return pages;
}

function findUnreachablePages(
  input: IDocsLinkCheckInput,
  roots: Iterable<string>,
  outgoingByPage: ReadonlyMap<string, ReadonlySet<string>>,
): string[] {
  const visited = new Set<string>();
  const queue = [...roots];
  while (queue.length > 0) {
    const page = queue.shift();
    if (page === undefined || visited.has(page)) continue;
    visited.add(page);
    for (const next of outgoingByPage.get(page) ?? []) queue.push(next);
  }
  const published = `${path.posix.join(input.docsRoot, input.publishedDirectory)}/`;
  return [...input.documents.keys()].filter((page) => page.startsWith(published) && !visited.has(page)).sort();
}

/** Code-unit order: deterministic on every platform, unlike locale-aware comparison. */
function compareStrings(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function compareProblems(left: IDocsLinkProblem, right: IDocsLinkProblem): number {
  return compareStrings(left.file, right.file) || left.line - right.line || compareStrings(left.message, right.message);
}

/**
 * Pure check over already-parsed pages: dead relative links, dead anchors, structural markdown
 * problems, sidebar entries that select nothing, and published pages nobody can navigate to.
 */
export function checkDocsLinks(input: IDocsLinkCheckInput): IDocsLinkCheckResult {
  const problems: IDocsLinkProblem[] = [];
  const outgoingByPage = new Map<string, ReadonlySet<string>>();
  let linkCount = 0;
  let anchorCount = 0;

  for (const [file, document] of input.documents) {
    for (const problem of document.problems) problems.push({ file, line: problem.line, message: problem.message });
    const context: ILinkContext = { input, file, document, problems, outgoing: new Set<string>(), anchorCount: 0 };
    for (const link of document.links) checkLink(context, link);
    outgoingByPage.set(file, context.outgoing);
    linkCount += document.links.length;
    anchorCount += context.anchorCount;
  }

  const entryPage = path.posix.join(input.docsRoot, input.entryPage);
  if (!input.documents.has(entryPage)) {
    problems.push({ file: entryPage, line: 1, message: "entry page is missing, so reachability cannot be checked" });
  }

  if (input.sidebar.entries.length === 0) {
    problems.push({
      file: input.sidebar.file,
      line: 1,
      message: "no sidebar link, slug or autogenerate entries were recognized; the sidebar parser needs updating",
    });
  }
  const roots = new Set<string>([entryPage]);
  for (const entry of input.sidebar.entries) {
    for (const page of checkSidebarEntry(input, entry, problems)) roots.add(page);
  }

  for (const page of findUnreachablePages(input, roots, outgoingByPage)) {
    problems.push({
      file: page,
      line: 1,
      message: `page is not linked from ${input.entryPage} (directly or through other pages) and is not selected by the Starlight sidebar in ${input.sidebar.file}`,
    });
  }

  return {
    problems: problems.sort(compareProblems),
    summary: { pageCount: input.documents.size, linkCount, anchorCount },
  };
}
