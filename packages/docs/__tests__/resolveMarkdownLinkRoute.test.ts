import { describe, expect, test } from "bun:test";

import { resolveMarkdownLinkRoute } from "../resolveMarkdownLinkRoute";

const BASE = "/dotfiles/";

describe("resolveMarkdownLinkRoute", () => {
  test("maps a sibling page from a top-level page", () => {
    expect(resolveMarkdownLinkRoute("api-reference/lifecycle-hooks.md", "make-tool.md", BASE)).toBe(
      "/dotfiles/api-reference/lifecycle-hooks/",
    );
  });

  test("resolves parent-relative links against the linking page's directory and keeps the fragment", () => {
    expect(resolveMarkdownLinkRoute("../api-reference/core-api.md#hooks", "configuration/x.md", BASE)).toBe(
      "/dotfiles/api-reference/core-api/#hooks",
    );
  });

  test("maps an index page to its directory route", () => {
    expect(resolveMarkdownLinkRoute("foo/index.md", "index.md", BASE)).toBe("/dotfiles/foo/");
  });

  test("maps a link to the root index page to the site base", () => {
    expect(resolveMarkdownLinkRoute("../index.md", "configuration/x.md", BASE)).toBe("/dotfiles/");
  });

  test("resolves links from the root index page generated from the README", () => {
    expect(resolveMarkdownLinkRoute("make-tool.md", "index.md", BASE)).toBe("/dotfiles/make-tool/");
  });

  test("resolves explicit current-directory links", () => {
    expect(resolveMarkdownLinkRoute("./getting-started.md", "configuration/common-patterns.md", BASE)).toBe(
      "/dotfiles/configuration/getting-started/",
    );
  });

  test("adds the missing trailing slash to the base", () => {
    expect(resolveMarkdownLinkRoute("make-tool.md", "index.md", "/dotfiles")).toBe("/dotfiles/make-tool/");
  });

  test("leaves links that escape the content tree alone", () => {
    expect(resolveMarkdownLinkRoute("../SKILL.md", "make-tool.md", BASE)).toBeUndefined();
    expect(resolveMarkdownLinkRoute("../../SKILL.md", "configuration/x.md", BASE)).toBeUndefined();
  });

  test("leaves external, mail, absolute and fragment-only links alone", () => {
    expect(resolveMarkdownLinkRoute("https://example.com/page.md", "make-tool.md", BASE)).toBeUndefined();
    expect(resolveMarkdownLinkRoute("mailto:someone@example.com", "make-tool.md", BASE)).toBeUndefined();
    expect(resolveMarkdownLinkRoute("/absolute/page.md", "make-tool.md", BASE)).toBeUndefined();
    expect(resolveMarkdownLinkRoute("#hooks", "make-tool.md", BASE)).toBeUndefined();
  });

  test("leaves links that do not point at a markdown file alone", () => {
    expect(resolveMarkdownLinkRoute("install.sh", "make-tool.md", BASE)).toBeUndefined();
    expect(resolveMarkdownLinkRoute("configuration/", "make-tool.md", BASE)).toBeUndefined();
    expect(resolveMarkdownLinkRoute("notes.markdown", "make-tool.md", BASE)).toBeUndefined();
  });
});
