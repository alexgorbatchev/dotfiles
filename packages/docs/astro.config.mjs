// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// https://astro.build/config
export default defineConfig({
  site: "https://alexgorbatchev.github.io",
  base: "/dotfiles/",
  integrations: [
    starlight({
      title: "@dotfiles",
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/alexgorbatchev/dotfiles" }],
      sidebar: [
        { label: "Tool Creation Guide", slug: "make-tool" },
        { label: "Configuration", slug: "configuration" },
        { label: "Shell & Hooks", slug: "shell-and-hooks" },
        { label: "API Reference", slug: "api-reference" },
        {
          label: "Installation Methods",
          autogenerate: { directory: "installation-methods" },
        },
      ],
    }),
  ],
});
