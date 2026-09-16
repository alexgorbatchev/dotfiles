import { describe, expect, it } from "bun:test";
import { formatError } from "../formatError";

describe("formatError", () => {
  it("extracts the cask trust command from an untrusted tap error", () => {
    const error = `Error: Refusing to load cask nikitabobko/tap/aerospace from untrusted tap nikitabobko/tap.
Run \`brew trust --cask nikitabobko/tap/aerospace\` or \`brew trust nikitabobko/tap\` to trust it.`;

    const result = formatError(error);

    expect(result.command).toBe("brew trust --cask nikitabobko/tap/aerospace");
    expect(result.message).toBe("This Homebrew tap requires trust before installation.");
  });

  it("extracts a bare tap trust command", () => {
    const error = `Error: Refusing to load cask from untrusted tap.
Run \`brew trust homebrew-tap\` to trust it.`;

    const result = formatError(error);

    expect(result.command).toBe("brew trust homebrew-tap");
  });

  it("passes through errors that carry no trust command", () => {
    const result = formatError("Installation failed: Connection timeout");

    expect(result.command).toBeUndefined();
    expect(result.message).toBe("Installation failed: Connection timeout");
  });
});
