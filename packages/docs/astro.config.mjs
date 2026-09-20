// @ts-check
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import { unified } from "@astrojs/markdown-remark";
import { rehypeMarkdownLinks } from "./rehypeMarkdownLinks";

const base = "/dotfiles/";
const contentDir = fileURLToPath(new URL("./src/content/docs/", import.meta.url));

// https://astro.build/config
export default defineConfig({
  site: "https://alexgorbatchev.github.io",
  base,
  markdown: {
    // The source markdown links pages as `foo/bar.md`, which is right for `dotfiles skill` and the
    // embedded copy; only the website needs the Starlight route, so it is rewritten here at build time.
    processor: unified({
      rehypePlugins: [[rehypeMarkdownLinks, { base, contentDir }]],
    }),
  },
  integrations: [
    starlight({
      title: "@dotfiles",
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/alexgorbatchev/dotfiles" }],
      sidebar: [
        { label: "Overview", link: "/" },
        { label: "Tool Creation Guide", link: "/make-tool/" },
        {
          label: "Getting Started",
          items: [{ autogenerate: { directory: "getting-started" } }],
        },
        {
          label: "Configuration",
          items: [{ autogenerate: { directory: "configuration" } }],
        },
        {
          label: "API Reference",
          items: [{ autogenerate: { directory: "api-reference" } }],
        },
        {
          label: "Installation Methods",
          items: [{ autogenerate: { directory: "installation-methods" } }],
        },
      ],
    }),
  ],
});
