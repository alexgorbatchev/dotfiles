interface FileData {
  filePath: string;
  fileType?: string;
}

interface TreeNodeData {
  name: string;
  path: string;
  type: 'file' | 'directory';
  fileType?: string;
  children?: TreeNodeData[];
}

function sortTreeNode(n: TreeNodeData): void {
  if (n.children) {
    n.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    n.children.forEach(sortTreeNode);
  }
}

export function buildTreeForTool(files: FileData[]): TreeNodeData[] {
  if (!files?.length) return [];

  const paths = files.map((f) => f.filePath);
  let basePath = '';

  if (paths.length === 1) {
    const firstPath = paths[0];
    if (firstPath) {
      const parts = firstPath.split('/').filter(Boolean);
      if (parts.length >= 2) {
        basePath = '/' + parts.slice(0, parts.length - 2).join('/');
        if (basePath === '/') basePath = '';
      }
    }
  } else if (paths.length > 1) {
    const pathParts = paths.map((p) => p.split('/').filter(Boolean));
    const minLen = Math.min(...pathParts.map((p) => p.length));
    const common: string[] = [];
    const firstParts = pathParts[0];
    if (firstParts) {
      for (let i = 0; i < minLen - 1; i++) {
        const part = firstParts[i];
        if (part && pathParts.every((p) => p[i] === part)) common.push(part);
        else break;
      }
    }
    if (common.length > 1) {
      basePath = '/' + common.slice(0, -1).join('/');
    }
  }

  const tree = new Map<string, TreeNodeData>();

  for (const file of files) {
    let rel = file.filePath;
    if (basePath && rel.startsWith(basePath)) rel = rel.substring(basePath.length);
    if (!rel.startsWith('/')) rel = '/' + rel;
    const fileParts = rel.split('/').filter(Boolean);
    let currentPath = '';

    for (let i = 0; i < fileParts.length - 1; i++) {
      const part = fileParts[i];
      if (!part) continue;
      const parentPath = currentPath;
      currentPath = currentPath ? currentPath + '/' + part : '/' + part;
      const existing = tree.get(currentPath);
      if (!existing) {
        const node: TreeNodeData = { name: part, path: basePath + currentPath, type: 'directory', children: [] };
        tree.set(currentPath, node);
        const parent = parentPath ? tree.get(parentPath) : undefined;
        if (parent?.children) parent.children.push(node);
      } else if (existing.type === 'file') {
        existing.type = 'directory';
        existing.children = [];
      }
    }

    const fileName = fileParts[fileParts.length - 1];
    if (fileName) {
      const filePath = currentPath ? currentPath + '/' + fileName : '/' + fileName;
      const node: TreeNodeData = { name: fileName, path: basePath + filePath, type: 'file', fileType: file.fileType };
      tree.set(filePath, node);
      const parent = currentPath ? tree.get(currentPath) : undefined;
      if (parent?.children) parent.children.push(node);
    }
  }

  const roots: TreeNodeData[] = [];
  for (const [path, node] of tree) {
    const parentPath = path.substring(0, path.lastIndexOf('/'));
    if (!parentPath || !tree.has(parentPath)) roots.push(node);
  }

  roots.forEach(sortTreeNode);
  roots.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return roots;
}
