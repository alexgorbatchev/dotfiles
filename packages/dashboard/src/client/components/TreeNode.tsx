import { useState } from 'preact/hooks';

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
  catalog: 'text-gray-400',
  install: 'text-green-400',
  source: 'text-purple-400',
};

const fileTypeIcons: Record<string, string> = {
  install: '📂',
  'binary-path': '⚡',
  source: '🔗',
};

export function TreeNode({ node, depth = 0 }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isDirectory = node.type === 'directory';
  const hasChildren = node.children && node.children.length > 0;
  const indent = depth * 16;

  const icon = isDirectory ? '📁' : (fileTypeIcons[node.fileType || ''] || '📄');
  const colorClass = isDirectory ? 'text-amber-300' : (fileTypeColors[node.fileType || ''] || 'text-gray-300');

  return (
    <div>
      <div
        class='flex items-center py-1 hover:bg-gray-700 rounded cursor-pointer text-sm'
        style={{ paddingLeft: `${indent}px` }}
        onClick={() => isDirectory && hasChildren && setExpanded(!expanded)}
      >
        {isDirectory ?
          <span class='w-4 text-gray-400 mr-1'>{hasChildren ? (expanded ? '▼' : '▶') : '•'}</span> :
          <span class='w-4 mr-1' />}
        <span class={colorClass}>{icon}</span>
        <span class={`ml-2 ${isDirectory ? 'font-medium' : ''}`}>{node.name}</span>
        {!isDirectory && node.fileType && (
          <span class='ml-2 text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-400'>{node.fileType}</span>
        )}
      </div>
      {isDirectory && expanded && hasChildren && (
        <div>
          {node.children!.map((child, i) => <TreeNode key={i} node={child} depth={depth + 1} />)}
        </div>
      )}
    </div>
  );
}
