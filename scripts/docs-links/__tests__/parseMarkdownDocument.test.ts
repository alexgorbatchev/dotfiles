import assert from "node:assert";
import { describe, expect, test } from "bun:test";
import { headingTextContent, parseMarkdownDocument } from "../parseMarkdownDocument";

function markdown(...lines: string[]): string {
  return lines.join("\n");
}

describe("headingTextContent", () => {
  test("keeps code span content verbatim and drops the backticks", () => {
    expect(headingTextContent("Use `<div>` and `a_b`")).toBe("Use <div> and a_b");
  });

  test("keeps link text and drops the destination", () => {
    expect(headingTextContent("See [the guide](guide.md#top) and [ref][label]")).toBe("See the guide and ref");
  });

  test("drops images entirely, like an img element with no text content", () => {
    expect(headingTextContent("Logo ![alt text](logo.png) here")).toBe("Logo  here");
  });

  test("removes underscore emphasis delimiters but keeps intraword underscores", () => {
    expect(headingTextContent("_emphasis_ and __strong__ keep snake_case")).toBe("emphasis and strong keep snake_case");
  });

  test("drops inline HTML tags but keeps their text", () => {
    expect(headingTextContent("Press <kbd>Ctrl</kbd> now")).toBe("Press Ctrl now");
  });

  test("decodes entities and backslash escapes", () => {
    expect(headingTextContent("Tom &amp; Jerry \\_literal\\_ &#35;1 &#x41;")).toBe("Tom & Jerry _literal_ #1 A");
  });

  test("collapses smartypants dash runs, which become dashes the slugger removes", () => {
    expect(headingTextContent("Before -- after --- end")).toBe("Before  after  end");
  });

  test("does not apply prose rules inside code spans", () => {
    expect(headingTextContent("`--flag` and `&amp;`")).toBe("--flag and &amp;");
  });
});

describe("parseMarkdownDocument headings", () => {
  test("separates the first level-1 heading as the title and slugs the rest in order", () => {
    const parsed = parseMarkdownDocument(markdown("# Page Title", "", "## First", "### Second"));

    expect(parsed.titleHeading).toEqual({ line: 1, level: 1, text: "Page Title", slug: "page-title" });
    expect(parsed.headings).toEqual([
      { line: 3, level: 2, text: "First", slug: "first" },
      { line: 4, level: 3, text: "Second", slug: "second" },
    ]);
  });

  test("dedupes repeated headings without letting the title claim a slug", () => {
    const parsed = parseMarkdownDocument(markdown("# Setup", "## Setup", "## Setup", "## Setup 1"));

    expect(parsed.titleHeading?.slug).toBe("setup");
    expect(parsed.headings.map((heading) => heading.slug)).toEqual(["setup", "setup-1", "setup-1-1"]);
  });

  test("treats a second level-1 heading as a regular heading", () => {
    const parsed = parseMarkdownDocument(markdown("# One", "# Two"));

    expect(parsed.titleHeading?.text).toBe("One");
    expect(parsed.headings).toEqual([{ line: 2, level: 1, text: "Two", slug: "two" }]);
  });

  test("strips closing hash sequences and surrounding whitespace", () => {
    const parsed = parseMarkdownDocument(markdown("##   Spaced Out   ##  "));

    expect(parsed.headings).toEqual([{ line: 1, level: 2, text: "Spaced Out", slug: "spaced-out" }]);
  });

  test("slugs headings with inline code the way the website does", () => {
    const parsed = parseMarkdownDocument(
      markdown("### `dotfiles install [tool]`", "### `.sourceFile()` - Source a Script File"),
    );

    expect(parsed.headings.map((heading) => heading.slug)).toEqual([
      "dotfiles-install-tool",
      "sourcefile---source-a-script-file",
    ]);
  });

  test("ignores hash lines that are not headings", () => {
    const parsed = parseMarkdownDocument(markdown("#NoSpace", "    # indented code", "####### seven"));

    expect(parsed.titleHeading).toBeUndefined();
    expect(parsed.headings).toEqual([]);
  });

  test("ignores headings inside fenced code and inside frontmatter", () => {
    const parsed = parseMarkdownDocument(
      markdown(
        "---",
        "title: # not a heading",
        "---",
        "```bash",
        "# comment",
        "```",
        "~~~",
        "## also code",
        "~~~",
        "## Real",
      ),
    );

    expect(parsed.titleHeading).toBeUndefined();
    expect(parsed.headings).toEqual([{ line: 10, level: 2, text: "Real", slug: "real" }]);
  });
});

describe("parseMarkdownDocument fences", () => {
  test("requires the closing fence to be at least as long as the opener", () => {
    const parsed = parseMarkdownDocument(markdown("````md", "```", "## inside", "```", "````", "## outside"));

    expect(parsed.headings).toEqual([{ line: 6, level: 2, text: "outside", slug: "outside" }]);
    expect(parsed.problems).toEqual([]);
  });

  test("reports a fence that is never closed", () => {
    const parsed = parseMarkdownDocument(markdown("Intro", "```ts", "const x = 1;", "## swallowed", "[link](a.md)"));

    expect(parsed.problems).toEqual([{ line: 2, message: "code fence opened here is never closed" }]);
    expect(parsed.headings).toEqual([]);
    expect(parsed.links).toEqual([]);
  });

  test("reports a bare fence that encloses a heading, the signature of a missing closing fence", () => {
    const parsed = parseMarkdownDocument(
      markdown("```typescript", "code", "```", "", "```", "", "## Installation Method Parameters", "", "- item", "```"),
    );

    expect(parsed.problems).toEqual([
      {
        line: 5,
        message:
          "code fence without a language opened here encloses a markdown heading on line 7; the previous fence is probably unterminated",
      },
    ]);
  });

  test("does not report hash comments inside a fence that declares a language", () => {
    const parsed = parseMarkdownDocument(markdown("```bash", "# comment", "## another", "```"));

    expect(parsed.problems).toEqual([]);
  });

  test("does not treat a backtick fence with backticks in its info string as a fence", () => {
    const parsed = parseMarkdownDocument(markdown("``` `not a fence`", "## Heading"));

    expect(parsed.headings).toEqual([{ line: 2, level: 2, text: "Heading", slug: "heading" }]);
    expect(parsed.problems).toEqual([]);
  });

  test("reports frontmatter that never closes", () => {
    const parsed = parseMarkdownDocument(markdown("---", "title: x", "## Heading"));

    expect(parsed.problems).toEqual([{ line: 1, message: "frontmatter opened here is never closed" }]);
    expect(parsed.headings).toEqual([]);
  });
});

describe("parseMarkdownDocument links", () => {
  test("collects inline links with their line numbers, including titles and angle brackets", () => {
    const parsed = parseMarkdownDocument(
      markdown('See [a](a.md) and [b](b.md#x "Title").', "", "Then [c](<sp ace.md>) and ![img](pic.png)."),
    );

    expect(parsed.links).toEqual([
      { line: 1, target: "a.md" },
      { line: 1, target: "b.md#x" },
      { line: 3, target: "sp ace.md" },
      { line: 3, target: "pic.png" },
    ]);
  });

  test("keeps balanced parentheses inside destinations", () => {
    const parsed = parseMarkdownDocument(markdown("[wiki](https://example.com/Foo_(bar)) and [x](a.md)"));

    expect(parsed.links.map((link) => link.target)).toEqual(["https://example.com/Foo_(bar)", "a.md"]);
  });

  test("records an empty destination so the checker can report it", () => {
    const parsed = parseMarkdownDocument(markdown("[empty]()"));

    expect(parsed.links).toEqual([{ line: 1, target: "" }]);
  });

  test("ignores links inside code spans and fenced code", () => {
    const parsed = parseMarkdownDocument(
      markdown("Use `[x](code.md)` here", "```", "[y](fence.md)", "```", "[z](real.md)"),
    );

    expect(parsed.links).toEqual([{ line: 5, target: "real.md" }]);
  });

  test("resolves full, collapsed and shortcut reference links case-insensitively", () => {
    const parsed = parseMarkdownDocument(
      markdown("[text][Guide] then [guide][] then [Guide].", "", "[guide]: guide.md#intro", "[unused]: <other.md>"),
    );

    expect(parsed.links).toEqual([
      { line: 1, target: "guide.md#intro" },
      { line: 1, target: "guide.md#intro" },
      { line: 1, target: "guide.md#intro" },
      { line: 3, target: "guide.md#intro" },
      { line: 4, target: "other.md" },
    ]);
    expect(parsed.problems).toEqual([]);
  });

  test("leaves bracketed prose alone when no definition matches", () => {
    const parsed = parseMarkdownDocument(markdown("Run `dotfiles install [tool]` or install [tool] directly."));

    expect(parsed.links).toEqual([]);
    expect(parsed.problems).toEqual([]);
  });

  test("reports full reference links whose label is never defined", () => {
    const parsed = parseMarkdownDocument(markdown("Read [the docs][missing]."));

    expect(parsed.links).toEqual([]);
    expect(parsed.problems).toEqual([
      { line: 1, message: 'reference link label "missing" is not defined anywhere in the page' },
    ]);
  });

  test("handles CRLF line endings", () => {
    const parsed = parseMarkdownDocument("# Title\r\n\r\n## Sub\r\n[a](a.md)\r\n");

    assert(parsed.titleHeading);
    expect(parsed.titleHeading.text).toBe("Title");
    expect(parsed.headings).toEqual([{ line: 3, level: 2, text: "Sub", slug: "sub" }]);
    expect(parsed.links).toEqual([{ line: 4, target: "a.md" }]);
  });
});
