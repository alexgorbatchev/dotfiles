import { GithubSlugger } from "./GithubSlugger";
import type { IMarkdownHeading, IMarkdownLink, IMarkdownProblem, IParsedMarkdownDocument } from "./types";

const FRONTMATTER_DELIMITER = /^---\s*$/;
const FENCE_OPENER = /^(\s*)(`{3,}|~{3,})(.*)$/;
const ATX_HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
const ATX_CLOSING_SEQUENCE = /(?:^|[ \t])#+[ \t]*$/;
const LINK_DEFINITION = /^ {0,3}\[((?:[^\\\]]|\\.)+)\]:[ \t]*(<[^>]*>|\S+)/;
const INLINE_LINK =
  /!?\[((?:[^[\]\\]|\\.|\[[^[\]]*\])*)\]\(\s*(<[^>]*>|[^\s()]*(?:\([^\s()]*\)[^\s()]*)*)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;
const FULL_REFERENCE_LINK = /!?\[((?:[^[\]\\]|\\.|\[[^[\]]*\])*)\]\[((?:[^[\]\\]|\\.)+)\]/g;
const COLLAPSED_REFERENCE_LINK = /!?\[((?:[^[\]\\]|\\.)+)\]\[\]/g;
const SHORTCUT_REFERENCE_LINK = /(?<!\]|!)\[((?:[^[\]\\]|\\.)+)\](?![[(:])/g;
const HTML_TAG = /<\/?[A-Za-z][^<>]*>/g;
const IMAGE = /!\[(?:[^[\]\\]|\\.)*\]\([^)]*\)/g;
const LINK_TEXT = /\[((?:[^[\]\\]|\\.)*)\](?:\([^)]*\)|\[[^\]]*\])/g;
const EMPHASIS_UNDERSCORE_OPENER = /(?<![\p{L}\p{N}_\\])_{1,3}(?=\S)/gu;
const EMPHASIS_UNDERSCORE_CLOSER = /(?<=[^\s\\])_{1,3}(?![\p{L}\p{N}_])/gu;
const SMARTYPANTS_DASHES = /-{2,}/g;
const BACKSLASH_ESCAPE = /\\([!-/:-@[-`{-~])/g;
const HTML_ENTITY = /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([A-Za-z]+));/g;
const NAMED_ENTITIES: ReadonlyMap<string, string> = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
  ["nbsp", String.fromCodePoint(0xa0)],
]);

type LineFilter = (index: number) => boolean;

interface ICodeSpanSplit {
  /** Text with every code span replaced by a single space. */
  prose: string;
  /** Segments in source order; code segments are the span content without delimiters. */
  segments: ITextSegment[];
}

interface ITextSegment {
  isCode: boolean;
  text: string;
}

interface IOpenFence {
  line: number;
  marker: string;
  hasInfoString: boolean;
  enclosedHeadingLine: number | undefined;
}

/**
 * Split a line into prose and code-span segments following the CommonMark rule that a backtick run
 * opens a span only when a run of exactly the same length closes it later on the line.
 */
function splitCodeSpans(line: string): ICodeSpanSplit {
  const segments: ITextSegment[] = [];
  let prose = "";
  let proseStart = 0;
  let index = 0;

  while (index < line.length) {
    if (line[index] !== "`") {
      index += 1;
      continue;
    }

    let runEnd = index;
    while (line[runEnd] === "`") runEnd += 1;
    const run = line.slice(index, runEnd);
    let closerStart = runEnd;
    let closerFound = -1;
    while (closerStart < line.length) {
      const candidate = line.indexOf(run, closerStart);
      if (candidate === -1) break;
      let candidateEnd = candidate;
      while (line[candidateEnd] === "`") candidateEnd += 1;
      if (candidateEnd - candidate === run.length) {
        closerFound = candidate;
        break;
      }
      closerStart = candidateEnd;
    }

    if (closerFound === -1) {
      index = runEnd;
      continue;
    }

    segments.push({ isCode: false, text: line.slice(proseStart, index) });
    segments.push({ isCode: true, text: line.slice(runEnd, closerFound) });
    prose += `${line.slice(proseStart, index)} `;
    index = closerFound + run.length;
    proseStart = index;
  }

  segments.push({ isCode: false, text: line.slice(proseStart) });
  prose += line.slice(proseStart);
  return { prose, segments };
}

function decodeEntities(text: string): string {
  return text.replace(
    HTML_ENTITY,
    (match, decimal: string | undefined, hex: string | undefined, name: string | undefined) => {
      if (decimal !== undefined) return String.fromCodePoint(Number.parseInt(decimal, 10));
      if (hex !== undefined) return String.fromCodePoint(Number.parseInt(hex, 16));
      return name === undefined ? match : (NAMED_ENTITIES.get(name) ?? match);
    },
  );
}

/**
 * Reduce the prose part of a heading to the text a browser would see, mirroring what Astro's
 * `rehypeHeadingIds` collects: HTML tags and images contribute nothing, links contribute their text,
 * emphasis delimiters vanish, escapes and entities decode, and `remark-smartypants` turns dash runs
 * into en/em dashes (which the slugger then removes).
 */
function headingProseToText(prose: string): string {
  return decodeEntities(
    prose
      .replace(HTML_TAG, "")
      .replace(IMAGE, "")
      .replace(LINK_TEXT, "$1")
      .replace(EMPHASIS_UNDERSCORE_OPENER, "")
      .replace(EMPHASIS_UNDERSCORE_CLOSER, "")
      .replace(SMARTYPANTS_DASHES, "")
      .replace(BACKSLASH_ESCAPE, "$1"),
  );
}

/**
 * Text content of a heading as Astro sees it before slugging.
 */
export function headingTextContent(rawHeading: string): string {
  return splitCodeSpans(rawHeading)
    .segments.map((segment) => (segment.isCode ? segment.text : headingProseToText(segment.text)))
    .join("");
}

function normalizeReferenceLabel(label: string): string {
  return label.trim().replaceAll(/\s+/g, " ").toLowerCase();
}

function stripAngleBrackets(destination: string): string {
  return destination.startsWith("<") && destination.endsWith(">") ? destination.slice(1, -1) : destination;
}

function collectLinkDefinitions(lines: string[], isContentLine: LineFilter): Map<string, string> {
  const definitions = new Map<string, string>();
  lines.forEach((line, index) => {
    if (!isContentLine(index)) return;
    const match = LINK_DEFINITION.exec(line);
    if (!match) return;
    const label = match[1];
    const destination = match[2];
    if (label === undefined || destination === undefined) return;
    const normalized = normalizeReferenceLabel(label);
    if (!definitions.has(normalized)) definitions.set(normalized, stripAngleBrackets(destination));
  });
  return definitions;
}

interface ILinePlan {
  contentLines: boolean[];
  structuralProblems: IMarkdownProblem[];
  headingLines: number[];
}

/**
 * First pass: decide which lines are prose (not frontmatter, not inside a fence) and report fences
 * that are never closed or that swallow a heading because the author forgot to close the previous one.
 */
function planLines(lines: string[]): ILinePlan {
  const contentLines: boolean[] = lines.map(() => false);
  const structuralProblems: IMarkdownProblem[] = [];
  const headingLines: number[] = [];
  let openFence: IOpenFence | undefined;
  let index = 0;

  if (lines[0] !== undefined && FRONTMATTER_DELIMITER.test(lines[0])) {
    const closingIndex = lines.findIndex((line, lineIndex) => lineIndex > 0 && FRONTMATTER_DELIMITER.test(line));
    if (closingIndex === -1) {
      structuralProblems.push({ line: 1, message: "frontmatter opened here is never closed" });
      return { contentLines, structuralProblems, headingLines };
    }
    index = closingIndex + 1;
  }

  for (; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const fenceMatch = FENCE_OPENER.exec(line);

    if (openFence) {
      const closes =
        fenceMatch !== null &&
        fenceMatch[2] !== undefined &&
        fenceMatch[2][0] === openFence.marker[0] &&
        fenceMatch[2].length >= openFence.marker.length &&
        (fenceMatch[3] ?? "").trim() === "";
      if (closes) {
        if (openFence.enclosedHeadingLine !== undefined) {
          structuralProblems.push({
            line: openFence.line,
            message: `code fence without a language opened here encloses a markdown heading on line ${openFence.enclosedHeadingLine}; the previous fence is probably unterminated`,
          });
        }
        openFence = undefined;
      } else if (!openFence.hasInfoString && openFence.enclosedHeadingLine === undefined && ATX_HEADING.test(line)) {
        openFence.enclosedHeadingLine = index + 1;
      }
      continue;
    }

    if (fenceMatch && fenceMatch[2] !== undefined) {
      const infoString = (fenceMatch[3] ?? "").trim();
      const isBacktickFenceWithBacktickInfo = fenceMatch[2][0] === "`" && infoString.includes("`");
      if (!isBacktickFenceWithBacktickInfo) {
        openFence = {
          line: index + 1,
          marker: fenceMatch[2],
          hasInfoString: infoString !== "",
          enclosedHeadingLine: undefined,
        };
        continue;
      }
    }

    contentLines[index] = true;
    if (ATX_HEADING.test(line)) headingLines.push(index);
  }

  if (openFence) {
    structuralProblems.push({ line: openFence.line, message: "code fence opened here is never closed" });
  }

  return { contentLines, structuralProblems, headingLines };
}

function parseHeading(line: string, lineNumber: number, slugger: GithubSlugger): IMarkdownHeading | undefined {
  const match = ATX_HEADING.exec(line);
  if (!match || match[1] === undefined) return undefined;
  const rawContent = (match[2] ?? "").replace(ATX_CLOSING_SEQUENCE, "").trim();
  const text = headingTextContent(rawContent);
  return { line: lineNumber, level: match[1].length, text, slug: slugger.slug(text) };
}

function collectLineLinks(
  line: string,
  lineNumber: number,
  definitions: ReadonlyMap<string, string>,
  links: IMarkdownLink[],
  problems: IMarkdownProblem[],
): void {
  const { prose } = splitCodeSpans(line);
  const withoutInline = prose.replace(INLINE_LINK, (_match, _text: string, destination: string) => {
    links.push({ line: lineNumber, target: stripAngleBrackets(destination) });
    return " ";
  });

  const resolveReference = (label: string): string => {
    const destination = definitions.get(normalizeReferenceLabel(label));
    if (destination === undefined) {
      problems.push({
        line: lineNumber,
        message: `reference link label "${label}" is not defined anywhere in the page`,
      });
    } else {
      links.push({ line: lineNumber, target: destination });
    }
    return " ";
  };

  const withoutFull = withoutInline.replace(FULL_REFERENCE_LINK, (_match, _text: string, label: string) =>
    resolveReference(label),
  );
  const withoutCollapsed = withoutFull.replace(COLLAPSED_REFERENCE_LINK, (_match, label: string) =>
    resolveReference(label),
  );
  withoutCollapsed.replace(SHORTCUT_REFERENCE_LINK, (match, label: string) => {
    const destination = definitions.get(normalizeReferenceLabel(label));
    if (destination !== undefined) links.push({ line: lineNumber, target: destination });
    return match;
  });
}

/**
 * Pure line-oriented markdown scan: headings with website-identical slugs, every link destination,
 * and structural problems. Fenced code is skipped for both headings and links.
 */
export function parseMarkdownDocument(source: string): IParsedMarkdownDocument {
  const lines = source.split(/\r?\n/);
  const plan = planLines(lines);
  const isContentLine: LineFilter = (index) => plan.contentLines[index] === true;
  const definitions = collectLinkDefinitions(lines, isContentLine);
  const slugger = new GithubSlugger();
  const headings: IMarkdownHeading[] = [];
  const links: IMarkdownLink[] = [];
  const problems: IMarkdownProblem[] = [...plan.structuralProblems];
  let titleHeading: IMarkdownHeading | undefined;

  for (const index of plan.headingLines) {
    const line = lines[index] ?? "";
    const isTitle = titleHeading === undefined && ATX_HEADING.exec(line)?.[1] === "#";
    const heading = parseHeading(line, index + 1, isTitle ? new GithubSlugger() : slugger);
    if (!heading) continue;
    if (isTitle) {
      titleHeading = heading;
    } else {
      headings.push(heading);
    }
  }

  lines.forEach((line, index) => {
    if (!isContentLine(index)) return;
    const definition = LINK_DEFINITION.exec(line);
    if (definition) {
      if (definition[2] !== undefined) links.push({ line: index + 1, target: stripAngleBrackets(definition[2]) });
      return;
    }
    collectLineLinks(line, index + 1, definitions, links, problems);
  });

  return { titleHeading, headings, links, problems };
}
