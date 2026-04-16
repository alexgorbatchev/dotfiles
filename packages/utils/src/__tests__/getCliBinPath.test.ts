import { afterEach, describe, expect, test } from "bun:test";
import { getCliBinPath } from "../getCliBinPath";

const originalArgv: string[] = [...process.argv];

afterEach(() => {
  process.argv = [...originalArgv];
});

describe("getCliBinPath", () => {
  test("returns the CLI script path without the active Bun executable", () => {
    process.argv = [
      "/tmp/dotfiles-install.abcd1234/bun/bin/bun",
      "/home/test/.dotfiles/node_modules/@alexgorbatchev/dotfiles/cli.js",
      "generate",
    ];

    expect(getCliBinPath()).toBe("/home/test/.dotfiles/node_modules/@alexgorbatchev/dotfiles/cli.js");
  });
});
