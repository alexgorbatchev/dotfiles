import { afterEach, describe, expect, test } from "bun:test";
import { getCliInvocationCommand } from "../getCliInvocationCommand";

const originalArgv: string[] = [...process.argv];

afterEach(() => {
  process.argv = [...originalArgv];
});

describe("getCliInvocationCommand", () => {
  test("uses bun from PATH instead of the active Bun executable path", () => {
    process.argv = [
      "/tmp/dotfiles-install.abcd1234/bun/bin/bun",
      "/home/test/.dotfiles/node_modules/@alexgorbatchev/dotfiles/cli.js",
      "generate",
    ];

    expect(getCliInvocationCommand()).toBe("bun /home/test/.dotfiles/node_modules/@alexgorbatchev/dotfiles/cli.js");
  });
});
