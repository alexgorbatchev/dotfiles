import { describe, expect, test } from "bun:test";
import { GithubSlugger, slugify } from "../GithubSlugger";

describe("slugify", () => {
  test("lowercases, drops punctuation and turns spaces into hyphens", () => {
    expect(slugify("Create `.tool.ts` Configuration")).toBe("create-toolts-configuration");
  });

  test("keeps hyphens and underscores, which GitHub treats as word characters", () => {
    expect(slugify("snake_case-name")).toBe("snake_case-name");
  });

  test("keeps every space as a hyphen, including leading and trailing ones", () => {
    expect(slugify("  Two  spaces ")).toBe("--two--spaces-");
  });

  test("keeps letters and marks from any script and removes symbols", () => {
    expect(slugify("Ünïcödé Héading ✓")).toBe("ünïcödé-héading-");
  });

  test("removes brackets, parentheses, colons and equals signs", () => {
    expect(slugify("dotfiles install [tool]: Dual-Mode (AGENT=1)")).toBe("dotfiles-install-tool-dual-mode-agent1");
  });

  test("returns an empty slug for punctuation-only input", () => {
    expect(slugify("***")).toBe("");
  });
});

describe("GithubSlugger", () => {
  test("appends -1, -2 to repeated slugs and skips suffixes another heading already owns", () => {
    const slugger = new GithubSlugger();

    expect(slugger.slug("Foo")).toBe("foo");
    expect(slugger.slug("Foo")).toBe("foo-1");
    expect(slugger.slug("Foo 1")).toBe("foo-1-1");
    expect(slugger.slug("Foo")).toBe("foo-2");
  });

  test("treats headings that differ only by case or punctuation as duplicates", () => {
    const slugger = new GithubSlugger();

    expect(slugger.slug("Install")).toBe("install");
    expect(slugger.slug("install!")).toBe("install-1");
  });

  test("keeps separate instances independent", () => {
    const first = new GithubSlugger();
    const second = new GithubSlugger();

    expect(first.slug("Same")).toBe("same");
    expect(second.slug("Same")).toBe("same");
  });
});
