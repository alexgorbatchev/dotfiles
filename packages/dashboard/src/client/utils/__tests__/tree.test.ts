import { describe, expect, test } from "bun:test";
import type { IFileState } from "../../../shared/types";
import { buildTreeForTool } from "../tree";

describe("buildTreeForTool", () => {
  test("returns an empty tree when the tool has no tracked artifacts", () => {
    expect(buildTreeForTool([])).toEqual([]);
  });

  test("retains the immediate parent and full path of a single nested artifact", () => {
    expect(
      buildTreeForTool([{ filePath: "/home/test/.generated/bin/bat", fileType: "shim", toolName: "bat" }]),
    ).toEqual([
      {
        name: "bin",
        path: "/home/test/.generated/bin",
        type: "directory",
        children: [{ name: "bat", path: "/home/test/.generated/bin/bat", type: "file", fileType: "shim" }],
      },
    ]);
  });

  test.each(["bat", "/bat"])("normalizes a root artifact %s without inventing a parent", (filePath) => {
    expect(buildTreeForTool([{ filePath, fileType: "binary", toolName: "bat" }])).toEqual([
      { name: "bat", path: "/bat", type: "file", fileType: "binary" },
    ]);
  });

  test("keeps shared context and sorts directories before files at every depth", () => {
    const files: IFileState[] = [
      { filePath: "/home/test/project/zshrc", toolName: "shell", fileType: "config" },
      { filePath: "/home/test/project/zsh/rc", toolName: "shell", fileType: "config" },
      { filePath: "/home/test/project/bash/zeta", toolName: "shell", fileType: "init" },
      { filePath: "/home/test/project/bash/alpha", toolName: "shell", fileType: "completion" },
      { filePath: "/home/test/project/bash/subdir/config", toolName: "shell", fileType: "config" },
      { filePath: "/home/test/project/bashrc", toolName: "shell", fileType: "config" },
    ];
    expect(buildTreeForTool(files)).toEqual([
      {
        name: "project",
        path: "/home/test/project",
        type: "directory",
        children: [
          {
            name: "bash",
            path: "/home/test/project/bash",
            type: "directory",
            children: [
              {
                name: "subdir",
                path: "/home/test/project/bash/subdir",
                type: "directory",
                children: [
                  { name: "config", path: "/home/test/project/bash/subdir/config", type: "file", fileType: "config" },
                ],
              },
              { name: "alpha", path: "/home/test/project/bash/alpha", type: "file", fileType: "completion" },
              { name: "zeta", path: "/home/test/project/bash/zeta", type: "file", fileType: "init" },
            ],
          },
          {
            name: "zsh",
            path: "/home/test/project/zsh",
            type: "directory",
            children: [{ name: "rc", path: "/home/test/project/zsh/rc", type: "file", fileType: "config" }],
          },
          { name: "bashrc", path: "/home/test/project/bashrc", type: "file", fileType: "config" },
          { name: "zshrc", path: "/home/test/project/zshrc", type: "file", fileType: "config" },
        ],
      },
    ]);
  });

  test("retains disjoint roots and applies directory-first alphabetical ordering", () => {
    const files: IFileState[] = [
      { filePath: "/zshrc", toolName: "shell", fileType: "config" },
      { filePath: "/var/shell", toolName: "shell", fileType: "init" },
      { filePath: "/etc/shell", toolName: "shell", fileType: "config" },
      { filePath: "/bashrc", toolName: "shell", fileType: "config" },
    ];
    expect(buildTreeForTool(files)).toEqual([
      {
        name: "etc",
        path: "/etc",
        type: "directory",
        children: [{ name: "shell", path: "/etc/shell", type: "file", fileType: "config" }],
      },
      {
        name: "var",
        path: "/var",
        type: "directory",
        children: [{ name: "shell", path: "/var/shell", type: "file", fileType: "init" }],
      },
      { name: "bashrc", path: "/bashrc", type: "file", fileType: "config" },
      { name: "zshrc", path: "/zshrc", type: "file", fileType: "config" },
    ]);
  });
});
