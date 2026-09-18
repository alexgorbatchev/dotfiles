import { describe, expect, test } from "bun:test";

import { rehypeMarkdownLinks } from "../rehypeMarkdownLinks";
import type { IHastNode } from "../types";

const CONTENT_DIR = "/site/src/content/docs";

function createTree(href: unknown): IHastNode {
  return {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "p",
        properties: {},
        children: [
          { type: "text" },
          { type: "element", tagName: "a", properties: { href }, children: [{ type: "text" }] },
        ],
      },
    ],
  };
}

function readAnchorHref(tree: IHastNode): unknown {
  return tree.children?.[0]?.children?.[1]?.properties?.["href"];
}

describe("rehypeMarkdownLinks", () => {
  const transform = rehypeMarkdownLinks({ base: "/dotfiles/", contentDir: CONTENT_DIR });

  test("rewrites a relative markdown link of a page inside the content directory", () => {
    const tree = createTree("../api-reference/core-api.md#hooks");

    transform(tree, { path: `${CONTENT_DIR}/configuration/x.md` });

    expect(readAnchorHref(tree)).toBe("/dotfiles/api-reference/core-api/#hooks");
  });

  test("accepts a content directory with a trailing slash and Windows separators in the file path", () => {
    const windowsTransform = rehypeMarkdownLinks({ base: "/dotfiles/", contentDir: `${CONTENT_DIR}/` });
    const tree = createTree("api-reference/lifecycle-hooks.md");

    windowsTransform(tree, { path: "\\site\\src\\content\\docs\\make-tool.md" });

    expect(readAnchorHref(tree)).toBe("/dotfiles/api-reference/lifecycle-hooks/");
  });

  test("leaves the tree alone when the file has no path", () => {
    const tree = createTree("make-tool.md");

    transform(tree, {});

    expect(readAnchorHref(tree)).toBe("make-tool.md");
  });

  test("leaves the tree alone when the file is outside the content directory", () => {
    const tree = createTree("make-tool.md");

    transform(tree, { path: "/site/src/pages/about.md" });

    expect(readAnchorHref(tree)).toBe("make-tool.md");
  });

  test("leaves anchors without a string href alone", () => {
    const tree = createTree(["a.md", "b.md"]);

    transform(tree, { path: `${CONTENT_DIR}/make-tool.md` });

    expect(readAnchorHref(tree)).toEqual(["a.md", "b.md"]);
  });

  test("leaves external links alone", () => {
    const tree = createTree("https://github.com/alexgorbatchev/dotfiles/blob/main/README.md");

    transform(tree, { path: `${CONTENT_DIR}/make-tool.md` });

    expect(readAnchorHref(tree)).toBe("https://github.com/alexgorbatchev/dotfiles/blob/main/README.md");
  });
});
