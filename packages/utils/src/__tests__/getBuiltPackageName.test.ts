import { describe, expect, test } from "bun:test";
import assert from "node:assert";
import { getBuiltPackageName, type IBuiltPackageEnvironment } from "../getBuiltPackageName";

describe("getBuiltPackageName", () => {
  test("returns default package name when environment variable is not set", () => {
    // process.env could leak here during test runs, so we simulate an explicit missing env
    const prevEnv = process.env.DOTFILES_BUILT_PACKAGE_NAME;
    delete process.env.DOTFILES_BUILT_PACKAGE_NAME;
    const env: IBuiltPackageEnvironment = {};

    const packageName: string = getBuiltPackageName(env);

    expect(packageName).toBe("@alexgorbatchev/dotfiles");

    const restorePackageName = new Map<boolean, VoidFunction>([
      [
        true,
        () => {
          process.env.DOTFILES_BUILT_PACKAGE_NAME = prevEnv ?? "";
        },
      ],
      [false, () => {}],
    ]).get(prevEnv !== undefined);

    assert(restorePackageName);
    restorePackageName();
  });

  test("returns configured package name when environment variable is set", () => {
    const env: IBuiltPackageEnvironment = {
      DOTFILES_BUILT_PACKAGE_NAME: "@dotfiles/core",
    };

    const packageName: string = getBuiltPackageName(env);

    expect(packageName).toBe("@dotfiles/core");
  });

  test("falls back to default when environment variable is empty", () => {
    // Set an explicit empty value directly in the mocked interface to verify it falls back
    const env: IBuiltPackageEnvironment = {
      DOTFILES_BUILT_PACKAGE_NAME: "   ",
    };

    // Clear out local process env interference
    const prevEnv = process.env.DOTFILES_BUILT_PACKAGE_NAME;
    delete process.env.DOTFILES_BUILT_PACKAGE_NAME;

    const packageName: string = getBuiltPackageName(env);

    expect(packageName).toBe("@alexgorbatchev/dotfiles");

    const restorePackageName = new Map<boolean, VoidFunction>([
      [
        true,
        () => {
          process.env.DOTFILES_BUILT_PACKAGE_NAME = prevEnv ?? "";
        },
      ],
      [false, () => {}],
    ]).get(prevEnv !== undefined);

    assert(restorePackageName);
    restorePackageName();
  });
});
