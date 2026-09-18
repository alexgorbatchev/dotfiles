import { describe, expect, test } from "bun:test";
import { checkDocsLinks } from "../checkDocsLinks";
import { parseMarkdownDocument } from "../parseMarkdownDocument";
import { parseStarlightSidebar } from "../parseStarlightSidebar";
import type { IDocsLinkCheckInput, IParsedMarkdownDocument } from "../types";

const DOCS_ROOT = "docs";
const SIDEBAR_FILE = "astro.config.mjs";
const DEFAULT_SIDEBAR = '{ link: "/" }';

function page(...lines: string[]): string {
  return lines.join("\n");
}

function buildInput(
  pages: Record<string, string>,
  sidebarSource: string = DEFAULT_SIDEBAR,
  extraFiles: string[] = [],
): IDocsLinkCheckInput {
  const documents = new Map<string, IParsedMarkdownDocument>();
  const files = new Set<string>();
  for (const [relativePath, source] of Object.entries(pages)) {
    documents.set(`${DOCS_ROOT}/${relativePath}`, parseMarkdownDocument(source));
    files.add(`${DOCS_ROOT}/${relativePath}`);
  }
  for (const relativePath of extraFiles) files.add(`${DOCS_ROOT}/${relativePath}`);
  return {
    docsRoot: DOCS_ROOT,
    entryPage: "SKILL.md",
    publishedDirectory: "references",
    documents,
    files,
    sidebar: parseStarlightSidebar(SIDEBAR_FILE, sidebarSource),
  };
}

describe("checkDocsLinks link resolution", () => {
  test("passes a corpus whose links, anchors and sidebar all resolve", () => {
    const result = checkDocsLinks(
      buildInput({
        "SKILL.md": page("# Skill", "[Guide](references/guides/intro.md#setup) [ext](https://x.y) <mailto:a@b.c>"),
        "references/guides/intro.md": page("# Intro", "## Setup", "[back](../../SKILL.md) [self](#setup)"),
      }),
    );

    expect(result).toEqual({ problems: [], summary: { pageCount: 2, linkCount: 4, anchorCount: 2 } });
  });

  test("reports links to files that do not exist, resolved relative to the linking page", () => {
    const result = checkDocsLinks(
      buildInput({
        "SKILL.md": page("[a](references/guides/intro.md)"),
        "references/guides/intro.md": page("[gone](api-reference.md) [gone2](../missing/x.md#frag)"),
      }),
    );

    expect(result.problems).toEqual([
      {
        file: "docs/references/guides/intro.md",
        line: 1,
        message: 'link destination "../missing/x.md#frag" does not exist (resolved to docs/references/missing/x.md)',
      },
      {
        file: "docs/references/guides/intro.md",
        line: 1,
        message:
          'link destination "api-reference.md" does not exist (resolved to docs/references/guides/api-reference.md)',
      },
    ]);
  });

  test("reports anchors that match no heading in the target page", () => {
    const result = checkDocsLinks(
      buildInput({
        "SKILL.md": page("[a](references/guides/intro.md#nope)"),
        "references/guides/intro.md": page("# Intro", "## Setup"),
      }),
    );

    expect(result.problems).toEqual([
      {
        file: "docs/SKILL.md",
        line: 1,
        message: 'anchor "#nope" does not match any heading in docs/references/guides/intro.md',
      },
    ]);
  });

  test("reports anchors that only match the page title, which the website strips", () => {
    const result = checkDocsLinks(
      buildInput({
        "SKILL.md": page("[a](references/guides/intro.md#intro)"),
        "references/guides/intro.md": page("# Intro"),
      }),
    );

    expect(result.problems).toEqual([
      {
        file: "docs/SKILL.md",
        line: 1,
        message:
          'anchor "#intro" points at the page title of docs/references/guides/intro.md; the website turns the first heading into the page title and drops its anchor, so link to the page without a fragment',
      },
    ]);
  });

  test("checks same-page anchors against the page's own headings", () => {
    const result = checkDocsLinks(
      buildInput({
        "SKILL.md": page("## Here", "[ok](#here) [bad](#there) [empty](#)"),
      }),
    );

    expect(result.problems).toEqual([
      { file: "docs/SKILL.md", line: 2, message: 'anchor "#there" does not match any heading in this page' },
      { file: "docs/SKILL.md", line: 2, message: 'link destination "#" has neither a path nor an anchor' },
    ]);
  });

  test("decodes percent-encoded paths and anchors", () => {
    const result = checkDocsLinks(
      buildInput({
        "SKILL.md": page("[a](references/guides/my%20page.md#step-1) [bad](references/%E0%A4%A.md)"),
        "references/guides/my page.md": page("# My Page", "## Step 1"),
      }),
    );

    expect(result.problems).toEqual([
      {
        file: "docs/SKILL.md",
        line: 1,
        message: 'link destination "references/%E0%A4%A.md" is not valid percent-encoding',
      },
    ]);
  });

  test("rejects empty, absolute and out-of-root destinations", () => {
    const result = checkDocsLinks(
      buildInput({
        "SKILL.md": page("[e]() [abs](/make-tool/) [out](../README.md)"),
      }),
    );

    expect(result.problems).toEqual([
      {
        file: "docs/SKILL.md",
        line: 1,
        message:
          'link destination "../README.md" resolves to README.md, outside docs; the skill is shipped on its own, so pages must only link inside it',
      },
      {
        file: "docs/SKILL.md",
        line: 1,
        message:
          'link destination "/make-tool/" is absolute; the embedded skill and the website live at different roots, so use a path relative to this page',
      },
      { file: "docs/SKILL.md", line: 1, message: "link has an empty destination" },
    ]);
  });

  test("accepts links to non-markdown files that exist and rejects anchors on them", () => {
    const result = checkDocsLinks(
      buildInput(
        {
          "SKILL.md": page("![d](assets/diagram.png) [d](assets/diagram.png#x) [m](assets/missing.png)"),
        },
        DEFAULT_SIDEBAR,
        ["assets/diagram.png"],
      ),
    );

    expect(result.problems).toEqual([
      {
        file: "docs/SKILL.md",
        line: 1,
        message:
          'link destination "assets/diagram.png#x" has an anchor, but docs/assets/diagram.png is not a markdown page',
      },
      {
        file: "docs/SKILL.md",
        line: 1,
        message: 'link destination "assets/missing.png" does not exist (resolved to docs/assets/missing.png)',
      },
    ]);
  });

  test("surfaces structural problems found while parsing a page", () => {
    const result = checkDocsLinks(
      buildInput({
        "SKILL.md": page("```", "unterminated"),
      }),
    );

    expect(result.problems).toEqual([
      { file: "docs/SKILL.md", line: 1, message: "code fence opened here is never closed" },
    ]);
  });
});

describe("checkDocsLinks reachability", () => {
  test("reports published pages that neither SKILL.md nor the sidebar can reach", () => {
    const result = checkDocsLinks(
      buildInput(
        {
          "SKILL.md": page("[a](references/a.md)"),
          "references/a.md": page("[b](b.md)"),
          "references/b.md": page("reached through a"),
          "references/guides/auto.md": page("selected by autogenerate"),
          "references/orphan.md": page("nobody links here"),
          "references/other/lonely.md": page("nor here"),
        },
        '{ link: "/" }, { autogenerate: { directory: "guides" } }',
      ),
    );

    expect(result.problems).toEqual([
      {
        file: "docs/references/orphan.md",
        line: 1,
        message:
          "page is not linked from SKILL.md (directly or through other pages) and is not selected by the Starlight sidebar in astro.config.mjs",
      },
      {
        file: "docs/references/other/lonely.md",
        line: 1,
        message:
          "page is not linked from SKILL.md (directly or through other pages) and is not selected by the Starlight sidebar in astro.config.mjs",
      },
    ]);
  });

  test("treats explicit sidebar links and slugs as roots, matching foo.md or foo/index.md", () => {
    const result = checkDocsLinks(
      buildInput(
        {
          "SKILL.md": page("no links"),
          "references/make-tool.md": page("guide"),
          "references/getting-started/index.md": page("section index"),
          "references/cli.md": page("cli"),
        },
        '{ link: "/make-tool/" }, { link: "/getting-started/" }, { slug: "cli" }, { link: "https://example.com" }',
      ),
    );

    expect(result.problems).toEqual([]);
  });

  test("reports sidebar entries that select no page and a sidebar the parser cannot read", () => {
    const withDeadEntries = checkDocsLinks(
      buildInput(
        { "SKILL.md": page("x"), "references/a.md": page("a") },
        page(
          '{ link: "/" },',
          '{ link: "/missing/" },',
          '{ slug: "also-missing" },',
          '{ autogenerate: { directory: "nothing-here" } },',
          '{ link: "/a/" },',
        ),
      ),
    );
    const withoutEntries = checkDocsLinks(buildInput({ "SKILL.md": page("x") }, "export default {};"));

    expect(withDeadEntries.problems).toEqual([
      {
        file: "astro.config.mjs",
        line: 2,
        message: 'sidebar link "/missing/" does not match any page under references/',
      },
      {
        file: "astro.config.mjs",
        line: 3,
        message: 'sidebar slug "also-missing" does not match any page under references/',
      },
      {
        file: "astro.config.mjs",
        line: 4,
        message: 'sidebar autogenerate directory "nothing-here" contains no pages under references/',
      },
    ]);
    expect(withoutEntries.problems).toEqual([
      {
        file: "astro.config.mjs",
        line: 1,
        message: "no sidebar link, slug or autogenerate entries were recognized; the sidebar parser needs updating",
      },
    ]);
  });

  test("reports a missing entry page instead of silently passing", () => {
    const result = checkDocsLinks(buildInput({ "references/a.md": page("a") }, '{ link: "/a/" }'));

    expect(result.problems).toEqual([
      { file: "docs/SKILL.md", line: 1, message: "entry page is missing, so reachability cannot be checked" },
    ]);
  });

  test("sorts problems by file, then line, then message", () => {
    const result = checkDocsLinks(
      buildInput({
        "SKILL.md": page("[z](references/z.md)", "[y](references/y.md)", "[a](references/a.md)"),
        "references/b.md": page("[q](q.md)"),
      }),
    );

    expect(result.problems.map((problem) => `${problem.file}:${problem.line}`)).toEqual([
      "docs/SKILL.md:1",
      "docs/SKILL.md:2",
      "docs/SKILL.md:3",
      "docs/references/b.md:1",
      "docs/references/b.md:1",
    ]);
  });
});
