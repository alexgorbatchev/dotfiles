import { describe, expect, it } from "bun:test";
import { matchAssetPattern } from "../matchAssetPattern";

describe("matchAssetPattern", () => {
  it("matches glob patterns (existing behavior)", () => {
    expect(matchAssetPattern("bun-linux-aarch64.tar.gz", "*.tar.gz")).toBe(true);
    expect(matchAssetPattern("bun-linux-aarch64.zip", "*.tar.gz")).toBe(false);
  });

  it("matches regex string patterns against the same candidate value", () => {
    expect(matchAssetPattern("bun-linux-aarch64.tar.gz", "/^bun-.*\\.tar\\.gz$/")).toBe(true);
    expect(matchAssetPattern("bun-linux-aarch64.zip", "/^bun-.*\\.tar\\.gz$/")).toBe(false);
  });

  it("matches RegExp patterns against the same candidate value", () => {
    const pattern = /^bun-.*\.zip$/;

    expect(matchAssetPattern("bun-linux-aarch64.zip", pattern)).toBe(true);
    expect(matchAssetPattern("bun-linux-aarch64.tar.gz", pattern)).toBe(false);
  });
});
