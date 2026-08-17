import { afterEach, describe, expect, test } from "bun:test";
import { highlightToolSource } from "../highlightToolSource";

describe("highlightToolSource", () => {
  const originalShiki = window.shiki;

  afterEach(() => {
    window.shiki = originalShiki;
  });

  test("uses fallback HTML escaping when shiki is not on window", async () => {
    window.shiki = undefined;
    const code = `const a = "<script>&'"</script>";`;
    const result = await highlightToolSource(code);

    expect(result).toContain('<pre class="shiki github-light"><code>');
    expect(result).toContain("&lt;script&gt;");
    expect(result).toContain("&amp;");
    expect(result).toContain("&quot;");
    expect(result).toContain("&#039;");
  });

  test("uses window.shiki when available", async () => {
    window.shiki = {
      codeToHtml: async (source, options) => {
        return `<span class="shiki">${options.lang}:${options.theme}:${source}</span>`;
      },
    };

    const result = await highlightToolSource("const x = 1;");
    expect(result).toBe('<span class="shiki">typescript:github-light:const x = 1;</span>');
  });

  test("falls back to plain escaped HTML if shiki throws", async () => {
    window.shiki = {
      codeToHtml: async () => {
        return Promise.reject(new Error("Shiki error"));
      },
    };

    const result = await highlightToolSource("const y = 2;");
    expect(result).toContain('<pre class="shiki github-light"><code>const y = 2;</code></pre>');
  });
});
