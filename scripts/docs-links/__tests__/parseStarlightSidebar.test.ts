import { describe, expect, test } from "bun:test";
import { parseStarlightSidebar } from "../parseStarlightSidebar";

function config(...lines: string[]): string {
  return lines.join("\n");
}

describe("parseStarlightSidebar", () => {
  test("extracts links, slugs and autogenerate directories with their line numbers", () => {
    const source = config(
      "export default defineConfig({",
      '  base: "/dotfiles/",',
      "  integrations: [",
      "    starlight({",
      '      social: [{ icon: "github", label: "GitHub", href: "https://github.com/x/y" }],',
      "      sidebar: [",
      '        { label: "Overview", link: "/" },',
      "        { label: 'Guide', link: '/make-tool/' },",
      '        { label: "CLI", slug: "getting-started/cli-reference" },',
      "        {",
      '          label: "Configuration",',
      '          autogenerate: { directory: "configuration" },',
      "        },",
      '        { label: "API", autogenerate: { collapsed: true, directory: "api-reference" } },',
      "      ],",
      "    }),",
      "  ],",
      "});",
    );

    expect(parseStarlightSidebar("astro.config.mjs", source)).toEqual({
      file: "astro.config.mjs",
      entries: [
        { kind: "link", line: 7, value: "/" },
        { kind: "link", line: 8, value: "/make-tool/" },
        { kind: "slug", line: 9, value: "getting-started/cli-reference" },
        { kind: "autogenerate", line: 12, value: "configuration" },
        { kind: "autogenerate", line: 14, value: "api-reference" },
      ],
    });
  });

  test("ignores commented-out lines", () => {
    const source = config('// { label: "Old", link: "/old/" },', '{ label: "New", link: "/new/" },');

    expect(parseStarlightSidebar("astro.config.mjs", source).entries).toEqual([
      { kind: "link", line: 2, value: "/new/" },
    ]);
  });

  test("returns no entries for a config without a sidebar", () => {
    expect(parseStarlightSidebar("astro.config.mjs", "export default {};").entries).toEqual([]);
  });
});
