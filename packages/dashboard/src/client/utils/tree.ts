interface IFileData {
  filePath: string;
  fileType?: string;
  lastOperation?: string;
}

interface ITreeNodeData {
  name: string;
  path: string;
  type: "file" | "directory";
  fileType?: string;
  lastOperation?: string;
  children?: ITreeNodeData[];
}

function sortTreeNode(node: ITreeNodeData): void {
  if (node.children) {
    node.children.sort((leftNode, rightNode) => {
      if (leftNode.type !== rightNode.type) return leftNode.type === "directory" ? -1 : 1;
      return leftNode.name.localeCompare(rightNode.name);
    });
    node.children.forEach(sortTreeNode);
  }
}

export function buildTreeForTool(files: IFileData[]): ITreeNodeData[] {
  if (!files.length) return [];

  const paths = files.map((file) => file.filePath);
  let basePath = "";

  if (paths.length === 1) {
    const firstPath = paths[0];
    if (firstPath) {
      const parts = firstPath.split("/").filter(Boolean);
      if (parts.length >= 2) {
        basePath = "/" + parts.slice(0, parts.length - 2).join("/");
        if (basePath === "/") basePath = "";
      }
    }
  } else {
    const pathParts = paths.map((path) => path.split("/").filter(Boolean));
    const minLength = Math.min(...pathParts.map((path) => path.length));
    const common: string[] = [];
    const firstParts = pathParts[0];
    if (firstParts) {
      for (let index = 0; index < minLength - 1; index += 1) {
        const part = firstParts[index];
        if (part && pathParts.every((path) => path[index] === part)) {
          common.push(part);
        } else {
          break;
        }
      }
    }
    if (common.length > 1) {
      basePath = "/" + common.slice(0, -1).join("/");
    }
  }

  const tree = new Map<string, ITreeNodeData>();

  for (const file of files) {
    let relativePath = file.filePath;
    if (basePath && relativePath.startsWith(basePath)) relativePath = relativePath.substring(basePath.length);
    if (!relativePath.startsWith("/")) relativePath = "/" + relativePath;
    const fileParts = relativePath.split("/").filter(Boolean);
    let currentPath = "";

    for (let index = 0; index < fileParts.length - 1; index += 1) {
      const part = fileParts[index];
      if (!part) continue;
      const parentPath = currentPath;
      currentPath = currentPath ? currentPath + "/" + part : "/" + part;
      const existingNode = tree.get(currentPath);
      if (!existingNode) {
        const node: ITreeNodeData = {
          name: part,
          path: basePath + currentPath,
          type: "directory",
          children: [],
        };
        tree.set(currentPath, node);
        const parentNode = parentPath ? tree.get(parentPath) : undefined;
        if (parentNode?.children) parentNode.children.push(node);
      } else if (existingNode.type === "file") {
        existingNode.type = "directory";
        existingNode.children = [];
      }
    }

    const fileName = fileParts[fileParts.length - 1];
    if (fileName) {
      const filePath = currentPath ? currentPath + "/" + fileName : "/" + fileName;
      const node: ITreeNodeData = {
        name: fileName,
        path: basePath + filePath,
        type: "file",
        fileType: file.fileType,
        lastOperation: file.lastOperation,
      };
      tree.set(filePath, node);
      const parentNode = currentPath ? tree.get(currentPath) : undefined;
      if (parentNode?.children) parentNode.children.push(node);
    }
  }

  const roots: ITreeNodeData[] = [];
  for (const [path, node] of tree) {
    const parentPath = path.substring(0, path.lastIndexOf("/"));
    if (!parentPath || !tree.has(parentPath)) roots.push(node);
  }

  roots.forEach(sortTreeNode);
  roots.sort((leftNode, rightNode) => {
    if (leftNode.type !== rightNode.type) return leftNode.type === "directory" ? -1 : 1;
    return leftNode.name.localeCompare(rightNode.name);
  });

  return roots;
}
