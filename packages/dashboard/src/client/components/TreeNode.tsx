import {
  ChevronDown,
  ChevronRight,
  Circle,
  File,
  FileCode,
  FileCog,
  FileSymlink,
  FileTerminal,
  Folder,
  FolderOpen,
  Link,
  Package,
  Settings,
  Zap,
} from 'lucide-preact';
import { type JSX } from 'preact';
import { useState } from 'preact/hooks';

import { cn } from '../lib/utils';
import { Badge } from './ui/Badge';

interface TreeNodeData {
  name: string;
  path: string;
  type: 'file' | 'directory';
  fileType?: string;
  children?: TreeNodeData[];
}

interface TreeNodeProps {
  node: TreeNodeData;
  depth?: number;
}

const fileTypeColors: Record<string, string> = {
  shim: 'text-blue-400',
  binary: 'text-green-400',
  'binary-path': 'text-cyan-400',
  symlink: 'text-purple-400',
  config: 'text-amber-400',
  completion: 'text-cyan-400',
  init: 'text-pink-400',
  'hook-generated': 'text-orange-400',
  catalog: 'text-muted-foreground',
  install: 'text-green-400',
  source: 'text-purple-400',
};

function getFileIcon(fileType?: string): JSX.Element {
  const iconClass = 'h-4 w-4';
  switch (fileType) {
    case 'shim':
      return <FileCode class={iconClass} />;
    case 'binary':
      return <FileTerminal class={iconClass} />;
    case 'binary-path':
      return <Zap class={iconClass} />;
    case 'symlink':
      return <FileSymlink class={iconClass} />;
    case 'config':
      return <FileCog class={iconClass} />;
    case 'completion':
      return <Settings class={iconClass} />;
    case 'init':
      return <FileCode class={iconClass} />;
    case 'hook-generated':
      return <FileCode class={iconClass} />;
    case 'catalog':
      return <Package class={iconClass} />;
    case 'install':
      return <Package class={iconClass} />;
    case 'source':
      return <Link class={iconClass} />;
    default:
      return <File class={iconClass} />;
  }
}

export function TreeNode({ node, depth = 0 }: TreeNodeProps): JSX.Element {
  const [expanded, setExpanded] = useState(true);
  const isDirectory = node.type === 'directory';
  const hasChildren = node.children && node.children.length > 0;
  const indent = depth * 16;

  const colorClass = isDirectory ? 'text-amber-300' : (fileTypeColors[node.fileType || ''] || 'text-muted-foreground');

  function renderChevron(): JSX.Element {
    if (!hasChildren) {
      return <Circle class='h-2 w-2 text-muted-foreground' />;
    }
    return expanded ?
      <ChevronDown class='h-4 w-4 text-muted-foreground' /> :
      <ChevronRight class='h-4 w-4 text-muted-foreground' />;
  }

  function renderIcon(): JSX.Element {
    if (isDirectory) {
      return expanded ?
        <FolderOpen class='h-4 w-4' /> :
        <Folder class='h-4 w-4' />;
    }
    return getFileIcon(node.fileType);
  }

  return (
    <div>
      <div
        class='flex items-center py-1 hover:bg-accent rounded cursor-pointer text-sm'
        style={{ paddingLeft: `${indent}px` }}
        onClick={() => isDirectory && hasChildren && setExpanded(!expanded)}
      >
        {isDirectory ?
          <span class='w-4 mr-1 flex items-center justify-center'>{renderChevron()}</span> :
          <span class='w-4 mr-1' />}
        <span class={colorClass}>{renderIcon()}</span>
        <span class={cn('ml-2', isDirectory && 'font-medium')}>{node.name}</span>
        {!isDirectory && node.fileType && (
          <Badge variant='outline' class='ml-2 text-xs'>
            {node.fileType}
          </Badge>
        )}
      </div>
      {isDirectory && expanded && hasChildren && (
        <div>
          {node.children?.map((child, i) => <TreeNode key={i} node={child} depth={depth + 1} />)}
        </div>
      )}
    </div>
  );
}
