import { createMemFileSystem, type IMemFileSystemReturn } from "@dotfiles/file-system";
import { beforeEach, describe, expect, it } from "bun:test";
import { getAllFilesRecursively } from "../getAllFilesRecursively";

describe("getAllFilesRecursively", () => {
  let memFs: IMemFileSystemReturn;

  beforeEach(async () => {
    memFs = await createMemFileSystem();
  });

  it("should return absolute paths when baseDir is not provided", async () => {
    await memFs.fs.ensureDir("/test/dir/subdir");
    await memFs.fs.writeFile("/test/dir/file1.txt", "content1");
    await memFs.fs.writeFile("/test/dir/subdir/file2.txt", "content2");

    const files = await getAllFilesRecursively(memFs.fs, "/test/dir");

    expect(files).toHaveLength(2);
    expect(files).toContain("/test/dir/file1.txt");
    expect(files).toContain("/test/dir/subdir/file2.txt");
    // All paths should be absolute (start with /)
    for (const file of files) {
      expect(file.startsWith("/")).toBe(true);
    }
  });

  it("should return relative paths when baseDir is provided", async () => {
    await memFs.fs.ensureDir("/test/dir/subdir");
    await memFs.fs.writeFile("/test/dir/file1.txt", "content1");
    await memFs.fs.writeFile("/test/dir/subdir/file2.txt", "content2");

    const files = await getAllFilesRecursively(memFs.fs, "/test/dir", "/test/dir");

    expect(files).toHaveLength(2);
    expect(files).toContain("file1.txt");
    expect(files).toContain("subdir/file2.txt");
    // No paths should be absolute when baseDir is provided
    for (const file of files) {
      expect(file.startsWith("/")).toBe(false);
    }
  });

  it("should handle deeply nested directories with absolute paths", async () => {
    await memFs.fs.ensureDir("/test/a/b/c/d");
    await memFs.fs.writeFile("/test/a/file1.txt", "content1");
    await memFs.fs.writeFile("/test/a/b/file2.txt", "content2");
    await memFs.fs.writeFile("/test/a/b/c/file3.txt", "content3");
    await memFs.fs.writeFile("/test/a/b/c/d/file4.txt", "content4");

    const files = await getAllFilesRecursively(memFs.fs, "/test/a");

    expect(files).toHaveLength(4);
    expect(files).toContain("/test/a/file1.txt");
    expect(files).toContain("/test/a/b/file2.txt");
    expect(files).toContain("/test/a/b/c/file3.txt");
    expect(files).toContain("/test/a/b/c/d/file4.txt");
  });

  it("should handle deeply nested directories with relative paths", async () => {
    await memFs.fs.ensureDir("/test/a/b/c/d");
    await memFs.fs.writeFile("/test/a/file1.txt", "content1");
    await memFs.fs.writeFile("/test/a/b/file2.txt", "content2");
    await memFs.fs.writeFile("/test/a/b/c/file3.txt", "content3");
    await memFs.fs.writeFile("/test/a/b/c/d/file4.txt", "content4");

    const files = await getAllFilesRecursively(memFs.fs, "/test/a", "/test/a");

    expect(files).toHaveLength(4);
    expect(files).toContain("file1.txt");
    expect(files).toContain("b/file2.txt");
    expect(files).toContain("b/c/file3.txt");
    expect(files).toContain("b/c/d/file4.txt");
  });

  it("should return empty array for empty directory", async () => {
    await memFs.fs.ensureDir("/test/empty");

    const files = await getAllFilesRecursively(memFs.fs, "/test/empty");

    expect(files).toHaveLength(0);
  });

  it("should handle directory with only subdirectories (no files)", async () => {
    await memFs.fs.ensureDir("/test/a/b/c");

    const files = await getAllFilesRecursively(memFs.fs, "/test/a");

    expect(files).toHaveLength(0);
  });
});
