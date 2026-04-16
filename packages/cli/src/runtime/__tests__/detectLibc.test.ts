import { Architecture, Libc, Platform } from "@dotfiles/core";
import { createMemFileSystem } from "@dotfiles/file-system";
import { describe, expect, it } from "bun:test";
import { detectLibc } from "../detectLibc";

describe("detectLibc", () => {
  it("should return unknown on non-Linux platforms", async () => {
    const memFs = await createMemFileSystem();

    const result = await detectLibc(Platform.MacOS, Architecture.Arm64, {
      fileSystem: memFs.fs,
    });

    expect(result).toBe(Libc.Unknown);
  });

  it("should prefer glibc information from the process report", async () => {
    const memFs = await createMemFileSystem();

    const result = await detectLibc(Platform.Linux, Architecture.X86_64, {
      fileSystem: memFs.fs,
      getProcessReport: () => ({ header: { glibcVersionRuntime: "2.39" } }),
    });

    expect(result).toBe(Libc.Gnu);
  });

  it("should detect glibc from loader paths when no process report is available", async () => {
    const memFs = await createMemFileSystem();
    await memFs.addFiles({
      "/lib64/ld-linux-x86-64.so.2": "",
    });

    const result = await detectLibc(Platform.Linux, Architecture.X86_64, {
      fileSystem: memFs.fs,
      getProcessReport: () => undefined,
    });

    expect(result).toBe(Libc.Gnu);
  });

  it("should detect musl from loader paths when no process report is available", async () => {
    const memFs = await createMemFileSystem();
    await memFs.addFiles({
      "/lib/ld-musl-x86_64.so.1": "",
    });

    const result = await detectLibc(Platform.Linux, Architecture.X86_64, {
      fileSystem: memFs.fs,
      getProcessReport: () => undefined,
    });

    expect(result).toBe(Libc.Musl);
  });

  it("should return unknown when both loader families are present", async () => {
    const memFs = await createMemFileSystem();
    await memFs.addFiles({
      "/lib64/ld-linux-x86-64.so.2": "",
      "/lib/ld-musl-x86_64.so.1": "",
    });

    const result = await detectLibc(Platform.Linux, Architecture.X86_64, {
      fileSystem: memFs.fs,
      getProcessReport: () => undefined,
    });

    expect(result).toBe(Libc.Unknown);
  });
});
