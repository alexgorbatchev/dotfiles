import { FileCode, FolderOpen } from 'lucide-preact';
import type { ComponentChildren } from 'preact';
import { type JSX } from 'preact';

import type { IFileTreeEntry, IToolConfigsTree, IToolDetail } from '../../shared/types';
import { useFetch } from '../hooks/useFetch';
import { InstallMethodBadge } from './InstallMethodBadge';
import { TitledCard } from './ui/TitledCard';
import { Tree, type TreeItemData } from './ui/Tree';

interface ToolsTreeViewProps {
  tools: IToolDetail[];
}

interface ToolTreeData {
  toolName?: string;
  isFile?: boolean;
  installMethod?: string;
  fileCount?: number;
  status?: 'installed' | 'not-installed' | 'error';
}

/**
 * Convert API file tree entries to Tree component items.
 */
function fileTreeToTreeItems(
  entries: IFileTreeEntry[],
  toolStatusMap: Map<string, 'installed' | 'not-installed' | 'error'>,
  toolMethodMap: Map<string, string>,
  toolFileCountMap: Map<string, number>,
): TreeItemData<ToolTreeData>[] {
  return entries.map((entry) => {
    if (entry.type === 'directory') {
      return {
        id: entry.path,
        label: entry.name,
        icon: <FolderOpen class='h-4 w-4 text-amber-300' />,
        children: entry.children
          ? fileTreeToTreeItems(entry.children, toolStatusMap, toolMethodMap, toolFileCountMap)
          : [],
      };
    }

    // File entry
    const status = entry.toolName ? toolStatusMap.get(entry.toolName) : undefined;
    const statusColor = status === 'installed' ?
      'text-green-400' :
      status === 'error' ?
      'text-red-400' :
      'text-blue-400';
    const dotColor = getStatusDotColor(status);

    return {
      id: entry.path,
      label: entry.name,
      icon: <FileCode class={`h-4 w-4 ${statusColor}`} />,
      iconDecorator: <span class={`inline-block w-2 h-2 rounded-full ${dotColor}`} />,
      data: {
        toolName: entry.toolName,
        isFile: true,
        installMethod: entry.toolName ? toolMethodMap.get(entry.toolName) : undefined,
        fileCount: entry.toolName ? toolFileCountMap.get(entry.toolName) : undefined,
        status,
      },
    };
  });
}

/**
 * Get the status dot color based on tool status.
 */
function getStatusDotColor(status?: 'installed' | 'not-installed' | 'error'): string {
  switch (status) {
    case 'installed':
      return 'bg-green-500';
    case 'error':
      return 'bg-red-500';
    default:
      return 'bg-gray-300';
  }
}

/**
 * Custom label renderer that shows .tool.ts extension in gray for files,
 * and adds install method badge with file count, right-aligned.
 */
function renderLabel(item: TreeItemData<ToolTreeData>): ComponentChildren {
  if (item.data?.isFile && item.label.endsWith('.tool.ts')) {
    const baseName = item.label.replace(/\.tool\.ts$/, '');
    const fileCount = item.data.fileCount ?? 0;
    return (
      <span class='flex items-center justify-between flex-1'>
        <span>
          {baseName}
          <span class='text-gray-400'>.tool.ts</span>
        </span>
        <span class='flex items-center gap-2'>
          {item.data.installMethod && <InstallMethodBadge method={item.data.installMethod} />}
          <span class='text-xs text-muted-foreground'>{fileCount} files</span>
        </span>
      </span>
    );
  }
  return item.label;
}

function handleItemClick(item: TreeItemData<ToolTreeData>): void {
  if (item.data?.toolName) {
    window.location.href = `/tools/${encodeURIComponent(item.data.toolName)}`;
  }
}

export function ToolsTreeView({ tools }: ToolsTreeViewProps): JSX.Element {
  const { data: treeData, loading } = useFetch<IToolConfigsTree>('/tool-configs-tree');

  // Build maps from tools
  const toolStatusMap = new Map<string, 'installed' | 'not-installed' | 'error'>();
  const toolMethodMap = new Map<string, string>();
  const toolFileCountMap = new Map<string, number>();
  for (const tool of tools) {
    toolStatusMap.set(tool.config.name, tool.runtime.status);
    toolMethodMap.set(tool.config.name, tool.config.installationMethod);
    toolFileCountMap.set(tool.config.name, tool.files.length);
  }

  if (loading) {
    return (
      <TitledCard title='Tool Files'>
        <div class='text-muted-foreground text-sm'>Loading...</div>
      </TitledCard>
    );
  }

  const treeItems = treeData
    ? fileTreeToTreeItems(treeData.entries, toolStatusMap, toolMethodMap, toolFileCountMap)
    : [];

  if (treeItems.length === 0) {
    return (
      <TitledCard title='Tool Files'>
        <div class='text-muted-foreground text-sm'>No tool files found</div>
      </TitledCard>
    );
  }

  return (
    <TitledCard title='Tool Files'>
      <Tree
        items={treeItems}
        defaultExpanded={true}
        onItemClick={handleItemClick}
        renderLabel={renderLabel}
        iconClassName='mr-1'
      />
    </TitledCard>
  );
}
