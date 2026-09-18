/**
 * Structural view of a hast node as produced by Astro's unified pipeline. `hast` is a transitive
 * dependency of Astro and is not resolvable from this package, so the plugin declares only the
 * shape it reads: every hast node type (root, element, text, comment, doctype) is assignable here.
 */
export interface IHastNode {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: IHastNode[];
}

/** The subset of the unified `VFile` a transformer receives that the plugin depends on. */
export interface IMarkdownFile {
  path?: string;
}

export interface IRehypeMarkdownLinksOptions {
  /** Astro `base`, for example `/dotfiles/`. */
  base: string;
  /** Absolute path of the Starlight docs collection directory (`src/content/docs`). */
  contentDir: string;
}

export type MarkdownLinkTransformer = (tree: IHastNode, file: IMarkdownFile) => void;

/** Receives the `properties` of every anchor element in a tree. */
export type AnchorVisitor = (properties: Record<string, unknown>) => void;
