export interface IMarkdownHeading {
  /** 1-based line number. */
  line: number;
  level: number;
  /** Plain text content as the rendered heading element would expose it. */
  text: string;
  slug: string;
}

export interface IMarkdownLink {
  /** 1-based line number. */
  line: number;
  /** Raw destination exactly as written, before any decoding. */
  target: string;
}

export interface IMarkdownProblem {
  /** 1-based line number. */
  line: number;
  message: string;
}

export interface IParsedMarkdownDocument {
  /**
   * First level-1 heading outside code fences. The website turns it into the page title and drops
   * it from the body, so it never yields an anchor there.
   */
  titleHeading: IMarkdownHeading | undefined;
  /** Every other heading, slugged in document order with one slugger per document. */
  headings: IMarkdownHeading[];
  links: IMarkdownLink[];
  problems: IMarkdownProblem[];
}

export type StarlightSidebarEntryKind = "link" | "slug" | "autogenerate";

export interface IStarlightSidebarEntry {
  kind: StarlightSidebarEntryKind;
  /** 1-based line number in the config source. */
  line: number;
  /** The `link` href, the `slug`, or the `autogenerate.directory`. */
  value: string;
}

export interface IStarlightSidebar {
  /** Path to the config file, used in problem reports. */
  file: string;
  entries: IStarlightSidebarEntry[];
}

export interface IDocsLinkProblem {
  file: string;
  /** 1-based line number. */
  line: number;
  message: string;
}

export interface IDocsLinkCheckInput {
  /** Directory that holds the skill; all other paths are relative to the same root as this one. */
  docsRoot: string;
  /** Page every other page must be reachable from, relative to `docsRoot`. */
  entryPage: string;
  /** Subdirectory of `docsRoot` that the website publishes, relative to `docsRoot`. */
  publishedDirectory: string;
  /** Parsed markdown pages keyed by path (same root as `docsRoot`). */
  documents: ReadonlyMap<string, IParsedMarkdownDocument>;
  /** Every file under `docsRoot`, markdown or not, keyed the same way as `documents`. */
  files: ReadonlySet<string>;
  sidebar: IStarlightSidebar;
}

export interface IDocsLinkCheckSummary {
  pageCount: number;
  linkCount: number;
  anchorCount: number;
}

export interface IDocsLinkCheckResult {
  problems: IDocsLinkProblem[];
  summary: IDocsLinkCheckSummary;
}
