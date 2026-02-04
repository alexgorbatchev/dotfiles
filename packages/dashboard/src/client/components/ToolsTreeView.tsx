import { File, Folder } from 'lucide-preact';
import { type JSX } from 'preact';

import type { IToolDetail } from '../../shared/types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Tree, type TreeItemData } from './ui/Tree';

interface ToolsTreeViewProps {
  tools: IToolDetail[];
}

interface ToolTreeData {
  toolName: string;
  status: 'installed' | 'not-installed' | 'error';
}

interface TreeNode {
  children: Map<string, TreeNode>;
  tool?: IToolDetail;
  isFile: boolean;
}

function nodeToTreeItem(name: string, node: TreeNode, path: string): TreeItemData<ToolTreeData> {
  const id = path ? `${path}/${name}` : name;

  if (node.isFile && node.tool) {
    const statusColor = node.tool.runtime.status === 'installed' ?
      'text-green-400' :
      node.tool.runtime.status === 'error' ?
      'text-red-400' :
      'text-muted-foreground';

    return {
      id,
      label: name,
      icon: <File class={`h-4 w-4 ${statusColor}`} />,
      data: {
        toolName: node.tool.config.name,
        status: node.tool.runtime.status,
      },
    };
  }

  const children = [...node.children.entries()]
    .map(([childName, childNode]) => nodeToTreeItem(childName, childNode, id))
    .toSorted((a, b) => {
      const aIsFolder = (a.children?.length ?? 0) > 0;
      const bIsFolder = (b.children?.length ?? 0) > 0;
      if (aIsFolder && !bIsFolder) return -1;
      if (!aIsFolder && bIsFolder) return 1;
      return a.label.localeCompare(b.label);
    });

  return {
    id,
    label: name,
    icon: <Folder class='h-4 w-4 text-blue-400' />,
    children,
  };
}

function sortTreeItems(items: TreeItemData<ToolTreeData>[]): TreeItemData<ToolTreeData>[] {
  return items.toSorted((a, b) => {
    const aIsFolder = (a.children?.length ?? 0) > 0;
    const bIsFolder = (b.children?.length ?? 0) > 0;
    if (aIsFolder && !bIsFolder) return -1;
    if (!aIsFolder && bIsFolder) return 1;
    return a.label.localeCompare(b.label);
  });
}

/**
 * Build a tree structure from tool config file paths.
 * Groups tools by their folder hierarchy.
 */
function buildToolTree(tools: IToolDetail[]): TreeItemData<ToolTreeData>[] {
  const rootNode: TreeNode = { children: new Map(), isFile: false };

  for (const tool of tools) {
    const configPath = tool.config.configFilePath;
    if (!configPath) continue;

    // Extract relative path from tools folder
    const toolsIndex = configPath.indexOf('/tools/');
    const relativePath = toolsIndex >= 0 ? configPath.slice(toolsIndex + 7) : configPath;
    const parts = relativePath.split('/');

    let current = rootNode;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i] ?? '';
      const isLast = i === parts.length - 1;

      if (!current.children.has(part)) {
        current.children.set(part, {
          children: new Map(),
          isFile: isLast,
          tool: isLast ? tool : undefined,
        });
      }
      const child = current.children.get(part);
      if (child) {
        current = child;
      }
    }
  }

  return sortTreeItems(
    [...rootNode.children.entries()].map(([name, node]) => nodeToTreeItem(name, node, '')),
  );
}

function handleItemClick(item: TreeItemData<ToolTreeData>): void {
  if (item.data?.toolName) {
    window.location.href = `/tools/${encodeURIComponent(item.data.toolName)}`;
  }
}

export function ToolsTreeView({ tools }: ToolsTreeViewProps): JSX.Element {
  const treeItems = buildToolTree(tools);

  if (treeItems.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tool Files</CardTitle>
        </CardHeader>
        <CardContent>
          <div class='text-muted-foreground text-sm'>No tool files found</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tool Files</CardTitle>
      </CardHeader>
      <CardContent>
        <Tree
          items={treeItems}
          defaultExpanded={true}
          onItemClick={handleItemClick}
          iconClassName='mr-1'
        />
      </CardContent>
    </Card>
  );
}
