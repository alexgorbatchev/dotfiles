import { describe, expect, test } from "bun:test";
import { buildTreeByTool } from "../buildTreeByTool";
import type { IFilesList } from "../types";

type CollectableNode = {
  name: string;
  type: string;
  fileType?: string;
  children?: CollectableNode[];
};

type CollectedNode = {
  name: string;
  fileType?: string;
};

function collectNodes(nodes: CollectableNode[]): CollectedNode[] {
  return nodes.flatMap((node) => {
    const childNodes = collectNodes(node.children ?? []);
    return [{ name: node.name, fileType: node.fileType }, ...childNodes];
  });
}

describe("buildTreeByTool", () => {
  test("returns empty object for null input", () => {
    const result = buildTreeByTool(null);
    expect(result).toEqual({});
  });

  test("returns empty object for empty files list", () => {
    const result = buildTreeByTool({ files: [], totalCount: 0 });
    expect(result).toEqual({});
  });

  test("handles single file showing parent dir as root", () => {
    const filesList: IFilesList = {
      files: [{ filePath: "/bin/fd", fileType: "shim", toolName: "fd" }],
      totalCount: 1,
    };
    const result = buildTreeByTool(filesList);

    expect(result["fd"]).toBeDefined();
    expect(result["fd"]).toHaveLength(1);
    expect(result["fd"]![0]!.name).toBe("bin");
    expect(result["fd"]![0]!.type).toBe("directory");
    expect(result["fd"]![0]!.children).toHaveLength(1);
    expect(result["fd"]![0]!.children![0]!.name).toBe("fd");
  });

  test("handles files at different depths without crashing", () => {
    const filesList: IFilesList = {
      files: [
        { filePath: "/home/user/.generated/binaries/fd/10.3.0", fileType: "install", toolName: "fd" },
        { filePath: "/home/user/.generated/binaries/fd/10.3.0/fd", fileType: "binary-path", toolName: "fd" },
        { filePath: "/home/user/.generated/user-bin/fd", fileType: "shim", toolName: "fd" },
      ],
      totalCount: 3,
    };

    const result = buildTreeByTool(filesList);

    expect(result["fd"]).toBeDefined();
    expect(result["fd"]!.length).toBeGreaterThan(0);
  });

  test("groups files by tool correctly", () => {
    const filesList: IFilesList = {
      files: [
        { filePath: "/bin/fd", fileType: "shim", toolName: "fd" },
        { filePath: "/bin/rg", fileType: "shim", toolName: "rg" },
      ],
      totalCount: 2,
    };
    const result = buildTreeByTool(filesList);

    expect(Object.keys(result)).toHaveLength(2);
    expect(result["fd"]).toBeDefined();
    expect(result["rg"]).toBeDefined();
  });

  test("creates nested directory structure", () => {
    const filesList: IFilesList = {
      files: [{ filePath: "/home/user/tools/fd/bin/fd", fileType: "binary", toolName: "fd" }],
      totalCount: 1,
    };
    const result = buildTreeByTool(filesList);

    expect(result["fd"]).toBeDefined();
    const root = result["fd"]![0];
    expect(root).toBeDefined();
  });

  test("handles directory paths (paths that are directories, not files)", () => {
    const filesList: IFilesList = {
      files: [
        { filePath: "/home/user/.generated/user-bin", fileType: "shim", toolName: "system" },
        { filePath: "/home/user/.generated/shell-scripts", fileType: "init", toolName: "system" },
        { filePath: "/home/user/.generated/shell-scripts/main.zsh", fileType: "init", toolName: "system" },
      ],
      totalCount: 3,
    };

    const result = buildTreeByTool(filesList);

    expect(result["system"]).toBeDefined();
    expect(result["system"]!.length).toBeGreaterThan(0);
  });

  test("handles real API data pattern that caused browser crash", () => {
    const filesList: IFilesList = {
      files: [
        { filePath: "/Users/test/.generated/user-bin/bat", fileType: "shim", toolName: "github-release--bat" },
        {
          filePath: "/Users/test/.generated/binaries/github-release--bat",
          fileType: "binary",
          toolName: "github-release--bat",
        },
        {
          filePath: "/Users/test/.generated/binaries/github-release--bat/uuid/bat",
          fileType: "binary",
          toolName: "github-release--bat",
        },
        {
          filePath: "/Users/test/.generated/binaries/github-release--bat/0.26.1",
          fileType: "binary",
          toolName: "github-release--bat",
        },
        {
          filePath: "/Users/test/.generated/binaries/github-release--bat/current",
          fileType: "binary",
          toolName: "github-release--bat",
        },
        {
          filePath: "/Users/test/.generated/binaries/github-release--bat/0.26.1",
          fileType: "install",
          toolName: "github-release--bat",
        },
        {
          filePath: "/Users/test/.generated/binaries/github-release--bat/0.26.1/bat",
          fileType: "binary-path",
          toolName: "github-release--bat",
        },
      ],
      totalCount: 7,
    };

    const result = buildTreeByTool(filesList);

    expect(result["github-release--bat"]).toBeDefined();
    expect(result["github-release--bat"]!.length).toBeGreaterThan(0);
  });

  test("handles files with common base path showing last common dir as root", () => {
    const filesList: IFilesList = {
      files: [
        { filePath: "/home/user/.generated/binaries/fd", fileType: "binary", toolName: "fd" },
        { filePath: "/home/user/.generated/user-bin/fd", fileType: "shim", toolName: "fd" },
      ],
      totalCount: 2,
    };
    const result = buildTreeByTool(filesList);

    expect(result["fd"]).toBeDefined();
    expect(result["fd"]!.length).toBe(1);
    expect(result["fd"]![0]!.name).toBe(".generated");
    expect(result["fd"]![0]!.children).toHaveLength(2);
  });

  test("install and binary-path files appear in tree output", () => {
    const filesList: IFilesList = {
      files: [
        { filePath: "/home/user/.generated/binaries/fd/10.3.0", fileType: "install", toolName: "fd" },
        { filePath: "/home/user/.generated/binaries/fd/10.3.0/fd", fileType: "binary-path", toolName: "fd" },
        { filePath: "/home/user/.generated/user-bin/fd", fileType: "shim", toolName: "fd" },
      ],
      totalCount: 3,
    };
    const result = buildTreeByTool(filesList);

    const allNodes = collectNodes(result["fd"] ?? []);
    const fileTypes = allNodes.map((node) => node.fileType).filter(Boolean);

    expect(fileTypes).toContain("install");
    expect(fileTypes).toContain("binary-path");
    expect(fileTypes).toContain("shim");
  });
});
