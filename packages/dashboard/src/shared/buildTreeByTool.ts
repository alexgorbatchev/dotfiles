import type { IFileEntry, IFilesList, IFileTreeNode } from "./types";

function sortTreeNode(n: IFileTreeNode): void {
  if (n.children) {
    n.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    n.children.forEach(sortTreeNode);
  }
}

/**
 * Build file tree grouped by tool from flat file list.
 * UI function for converting API response to tree structure.
 * The last directory of the common base path is kept as the visible root node.
 */
export function buildTreeByTool(filesList: IFilesList | null): Record<string, IFileTreeNode[]> {
  if (!filesList?.files) return {};

  // Group by tool
  const byTool: Record<string, IFileEntry[]> = {};
  for (const f of filesList.files) {
    const existing = byTool[f.toolName];
    if (existing) {
      existing.push(f);
    } else {
      byTool[f.toolName] = [f];
    }
  }

  // Build tree for each tool
  const result: Record<string, IFileTreeNode[]> = {};
  for (const [toolName, toolFiles] of Object.entries(byTool)) {
    // Find common base path (excluding the last directory which becomes the root)
    const paths = toolFiles.map((f) => f.filePath);
    let basePath = "";

    if (paths.length === 1) {
      // For single file, go up two levels: one for file, one for root dir
      const firstPath = paths[0];
      const parts = firstPath?.split("/").filter(Boolean) ?? [];
      if (parts.length >= 2) {
        basePath = "/" + parts.slice(0, parts.length - 2).join("/");
        if (basePath === "/") basePath = "";
      }
    } else if (paths.length > 1) {
      const parts = paths.map((p) => p.split("/").filter(Boolean));
      const minLen = Math.min(...parts.map((p) => p.length));
      const common: string[] = [];
      for (let i = 0; i < minLen - 1; i++) {
        const part = parts[0]?.[i];
        if (part && parts.every((p) => p[i] === part)) common.push(part);
        else break;
      }
      // Keep last common dir as root, rest as base path
      if (common.length > 0) {
        basePath = common.length > 1 ? "/" + common.slice(0, -1).join("/") : "";
      }
    }

    // Build tree
    const tree = new Map<string, IFileTreeNode>();
    for (const file of toolFiles) {
      let rel = file.filePath;
      if (basePath && rel.startsWith(basePath)) rel = rel.substring(basePath.length);
      if (!rel.startsWith("/")) rel = "/" + rel;
      const fileParts = rel.split("/").filter(Boolean);
      let currentPath = "";

      // Create directories
      for (let i = 0; i < fileParts.length - 1; i++) {
        const part = fileParts[i];
        if (!part) continue;
        const parentPath = currentPath;
        currentPath = currentPath ? currentPath + "/" + part : "/" + part;
        const existing = tree.get(currentPath);
        if (!existing) {
          const node: IFileTreeNode = {
            name: part,
            path: basePath + currentPath,
            type: "directory",
            children: [],
          };
          tree.set(currentPath, node);
          const parent = parentPath ? tree.get(parentPath) : undefined;
          if (parent?.children) {
            parent.children.push(node);
          }
        } else if (existing.type === "file") {
          // Convert file to directory (happens when install path has children)
          existing.type = "directory";
          existing.children = [];
        }
      }

      // Create file
      const fileName = fileParts[fileParts.length - 1];
      if (fileName) {
        const filePath = currentPath ? currentPath + "/" + fileName : "/" + fileName;
        const node: IFileTreeNode = {
          name: fileName,
          path: basePath + filePath,
          type: "file",
          fileType: file.fileType,
          toolName: file.toolName,
        };
        tree.set(filePath, node);
        const parent = currentPath ? tree.get(currentPath) : undefined;
        if (parent?.children) {
          parent.children.push(node);
        }
      }
    }

    // Find roots
    const roots: IFileTreeNode[] = [];
    for (const [path, node] of tree) {
      const parentPath = path.substring(0, path.lastIndexOf("/"));
      if (!parentPath || !tree.has(parentPath)) roots.push(node);
    }

    // Sort recursively
    roots.forEach(sortTreeNode);
    roots.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    result[toolName] = roots;
  }
  return result;
}
