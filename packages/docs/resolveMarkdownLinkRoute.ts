import { posix } from "node:path";

const MARKDOWN_EXTENSION = ".md";
const URL_SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/i;

/**
 * Maps a relative markdown link found on a docs page to the Starlight route it renders as.
 *
 * `href` is the link as written in the source, `pagePath` is the linking page's path relative to the
 * docs collection directory (`configuration/x.md`, `index.md`) and `base` is Astro's `base`. Returns
 * `undefined` for links that must be left alone: anything with a URL scheme (`https:`, `mailto:`),
 * absolute paths, fragment-only links, links that do not end in `.md`, and links that resolve outside
 * the docs collection (such as `../SKILL.md`).
 */
export function resolveMarkdownLinkRoute(href: string, pagePath: string, base: string): string | undefined {
  if (URL_SCHEME_PATTERN.test(href) || href.startsWith("/") || href.startsWith("#")) {
    return undefined;
  }

  const fragmentIndex = href.indexOf("#");
  const targetPath = fragmentIndex === -1 ? href : href.slice(0, fragmentIndex);
  const fragment = fragmentIndex === -1 ? "" : href.slice(fragmentIndex);

  if (!targetPath.endsWith(MARKDOWN_EXTENSION)) {
    return undefined;
  }

  const resolvedPath = posix.normalize(posix.join(posix.dirname(pagePath), targetPath));

  if (resolvedPath === ".." || resolvedPath.startsWith("../")) {
    return undefined;
  }

  const segments = resolvedPath.slice(0, -MARKDOWN_EXTENSION.length).split("/");

  if (segments.at(-1) === "index") {
    segments.pop();
  }

  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const route = segments.length === 0 ? "" : `${segments.join("/")}/`;

  return `${normalizedBase}${route}${fragment}`;
}
