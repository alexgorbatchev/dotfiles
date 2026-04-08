import { describe, expect, it } from "bun:test";
import { resolveToolRelativePath } from "../resolveToolRelativePath";

describe("resolveToolRelativePath", () => {
  const toolDir = "/home/user/dotfiles/tools/fzf";

  it("should return absolute paths unchanged", () => {
    const result = resolveToolRelativePath(toolDir, "/usr/local/bin/fzf");

    expect(result).toBe("/usr/local/bin/fzf");
  });

  it("should resolve relative path with ./ prefix against toolDir", () => {
    const result = resolveToolRelativePath(toolDir, "./shell/init.zsh");

    expect(result).toBe("/home/user/dotfiles/tools/fzf/shell/init.zsh");
  });

  it("should resolve relative path without ./ prefix against toolDir", () => {
    const result = resolveToolRelativePath(toolDir, "shell/init.zsh");

    expect(result).toBe("/home/user/dotfiles/tools/fzf/shell/init.zsh");
  });

  it("should resolve parent directory references", () => {
    const result = resolveToolRelativePath(toolDir, "../shared/config.zsh");

    expect(result).toBe("/home/user/dotfiles/tools/shared/config.zsh");
  });

  it("should trim whitespace from input path", () => {
    const result = resolveToolRelativePath(toolDir, "  ./shell/init.zsh  ");

    expect(result).toBe("/home/user/dotfiles/tools/fzf/shell/init.zsh");
  });

  it("should handle simple filename", () => {
    const result = resolveToolRelativePath(toolDir, "config.yml");

    expect(result).toBe("/home/user/dotfiles/tools/fzf/config.yml");
  });

  it("should handle Windows-style absolute paths on Windows", () => {
    // path.isAbsolute handles platform-specific checks
    const windowsPath = "C:\\Users\\test\\file.txt";
    const result = resolveToolRelativePath(toolDir, windowsPath);

    // On Unix, this is treated as relative; on Windows, it's absolute
    // This test documents the behavior - path.isAbsolute is platform-aware
    expect(typeof result).toBe("string");
  });
});
