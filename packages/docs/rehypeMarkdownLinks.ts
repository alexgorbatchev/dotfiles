import { posix } from "node:path";

import { resolveMarkdownLinkRoute } from "./resolveMarkdownLinkRoute";
import type { AnchorVisitor, IHastNode, IRehypeMarkdownLinksOptions, MarkdownLinkTransformer } from "./types";

const BACKSLASH_PATTERN = /\\/g;

function toPosixPath(filePath: string): string {
  return filePath.replace(BACKSLASH_PATTERN, "/");
}

function visitAnchors(node: IHastNode, visit: AnchorVisitor): void {
  if (node.type === "element" && node.tagName === "a" && node.properties !== undefined) {
    visit(node.properties);
  }

  for (const child of node.children ?? []) {
    visitAnchors(child, visit);
  }
}

/**
 * Rehype plugin that rewrites relative `.md` links to the Starlight route of the page they point to.
 *
 * The same markdown tree is read by agents (`dotfiles skill`), embedded in the binary, and published
 * as the website. `api-reference/lifecycle-hooks.md` is the correct link for the first two readers, so
 * only the website rewrites it, at the markdown-to-HTML step, resolved against the linking file's own
 * location inside the docs collection. Register it as `[rehypeMarkdownLinks, options]`.
 */
export function rehypeMarkdownLinks(options: IRehypeMarkdownLinksOptions): MarkdownLinkTransformer {
  const contentDir = toPosixPath(options.contentDir);

  return (tree, file) => {
    if (file.path === undefined) {
      return;
    }

    const pagePath = posix.relative(contentDir, toPosixPath(file.path));

    if (pagePath.startsWith("..") || posix.isAbsolute(pagePath)) {
      return;
    }

    visitAnchors(tree, (properties) => {
      const href = properties["href"];

      if (typeof href !== "string") {
        return;
      }

      const route = resolveMarkdownLinkRoute(href, pagePath, options.base);

      if (route !== undefined) {
        properties["href"] = route;
      }
    });
  };
}
