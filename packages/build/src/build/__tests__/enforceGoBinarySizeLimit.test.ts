import { describe, expect, test, beforeAll, afterAll, spyOn } from "bun:test";
import fs, { type StatSyncFn } from "node:fs";
import { enforceGoBinarySizeLimit } from "../steps/enforceGoBinarySizeLimit";
import { createBuildContext } from "../helpers/createBuildContext";
import { BuildError } from "../handleBuildError";

describe("enforceGoBinarySizeLimit", () => {
  const context = createBuildContext();
  const binaryPath = context.paths.compiledBinaryOutputFile;

  beforeAll(() => {
    fs.mkdirSync(context.paths.outputDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(binaryPath, { force: true });
  });

  test("throws error if binary is missing", () => {
    fs.rmSync(binaryPath, { force: true });
    expect(() => enforceGoBinarySizeLimit(context)).toThrow(new BuildError("dotfiles output is missing"));
  });

  test("passes if binary size is within limit", () => {
    fs.writeFileSync(binaryPath, "a".repeat(1024)); // 1 KB
    expect(() => enforceGoBinarySizeLimit(context)).not.toThrow();
  });

  test("throws error if binary size exceeds limit", () => {
    // 25 MB + 1 byte
    const largeSize = context.constants.maxGoBinarySizeBytes + 1;

    // We mock fs.statSync to avoid writing a huge file to disk in unit tests!
    const spy = spyOn(fs, "statSync").mockImplementation(((p: fs.PathLike) => {
      // Return a mocked stats object directly through unknown to satisfy TS Stats types without using explicit any
      return {
        isFile: () => p === binaryPath,
        size: largeSize,
      } as unknown as fs.Stats;
    }) as unknown as StatSyncFn);

    fs.writeFileSync(binaryPath, "dummy");

    try {
      expect(() => enforceGoBinarySizeLimit(context)).toThrow(BuildError);
    } finally {
      spy.mockRestore();
    }
  });
});
