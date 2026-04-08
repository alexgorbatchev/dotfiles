import { describe, expect, test } from "bun:test";
import { normalizeVersion } from "../normalizeVersion";

describe("normalizeVersion", () => {
  test("preserves standard version string", () => {
    const result: string = normalizeVersion("1.2.3");
    expect(result).toBe("1.2.3");
  });

  test("preserves v prefix (path-safe)", () => {
    const result: string = normalizeVersion("v1.2.3");
    expect(result).toBe("v1.2.3");
  });

  test("replaces forward slashes with dashes", () => {
    const result: string = normalizeVersion("1.2.3/build");
    expect(result).toBe("1.2.3-build");
  });

  test("replaces backslashes with dashes", () => {
    const result: string = normalizeVersion("1.2.3\\build");
    expect(result).toBe("1.2.3-build");
  });

  test("replaces colons with dashes", () => {
    const result: string = normalizeVersion("1.2.3:beta");
    expect(result).toBe("1.2.3-beta");
  });

  test("replaces special characters with underscores", () => {
    const result: string = normalizeVersion("1.2.3<beta>");
    expect(result).toBe("1.2.3_beta_");
  });

  test("handles version with prerelease", () => {
    const result: string = normalizeVersion("1.2.3-alpha.1");
    expect(result).toBe("1.2.3-alpha.1");
  });

  test("handles version with build metadata", () => {
    const result: string = normalizeVersion("1.2.3+build.123");
    expect(result).toBe("1.2.3+build.123");
  });

  test("returns empty string for empty input", () => {
    const result: string = normalizeVersion("");
    expect(result).toBe("");
  });

  test("trims whitespace", () => {
    const result: string = normalizeVersion("  1.2.3  ");
    expect(result).toBe("1.2.3");
  });
});
