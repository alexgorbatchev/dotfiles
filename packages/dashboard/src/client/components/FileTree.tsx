import { type JSX } from "preact";
import {
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
} from "../icons";

import { Badge } from "./ui/Badge";
import { Tree, type ITreeItemData } from "./ui/Tree";

interface IFileTreeNodeData {
  name: string;
  path: string;
  type: "file" | "directory";
  fileType?: string;
  lastOperation?: string;
  children?: IFileTreeNodeData[];
}

interface IFileTreeProps {
  nodes: IFileTreeNodeData[];
  collapsedIds?: ReadonlySet<string>;
  onItemToggle?: (item: ITreeItemData<IFileTreeNodeData>, nextExpanded: boolean) => void;
}

const FILE_TYPE_COLORS: Record<string, string> = {
  shim: "text-blue-400",
  binary: "text-green-400",
  "binary-path": "text-cyan-400",
  symlink: "text-purple-400",
  config: "text-amber-400",
  completion: "text-cyan-400",
  init: "text-pink-400",
  "hook-generated": "text-orange-400",
  catalog: "text-muted-foreground",
  install: "text-green-400",
  source: "text-purple-400",
};

function getFileIcon(fileType?: string): JSX.Element {
  const iconClass = "h-4 w-4";
  switch (fileType) {
    case "shim":
      return <FileCode class={iconClass} />;
    case "binary":
      return <FileTerminal class={iconClass} />;
    case "binary-path":
      return <Zap class={iconClass} />;
    case "symlink":
      return <FileSymlink class={iconClass} />;
    case "config":
      return <FileCog class={iconClass} />;
    case "completion":
      return <Settings class={iconClass} />;
    case "init":
    case "hook-generated":
      return <FileCode class={iconClass} />;
    case "catalog":
    case "install":
      return <Package class={iconClass} />;
    case "source":
      return <Link class={iconClass} />;
    default:
      return <File class={iconClass} />;
  }
}

function getIcon(node: IFileTreeNodeData): JSX.Element {
  const isDirectory = node.type === "directory";
  const hasChildren = node.children && node.children.length > 0;
  const colorClass = isDirectory ? "text-amber-300" : FILE_TYPE_COLORS[node.fileType || ""] || "text-muted-foreground";

  if (isDirectory) {
    return <span class={colorClass}>{hasChildren ? <FolderOpen class="h-4 w-4" /> : <Folder class="h-4 w-4" />}</span>;
  }
  return <span class={colorClass}>{getFileIcon(node.fileType)}</span>;
}

function convertToTreeItems(nodes: IFileTreeNodeData[]): ITreeItemData<IFileTreeNodeData>[] {
  return nodes.map((node) => ({
    id: node.path,
    label: node.name,
    icon: getIcon(node),
    data: node,
    children: node.children ? convertToTreeItems(node.children) : undefined,
  }));
}

function renderFileLabel(item: ITreeItemData<IFileTreeNodeData>): JSX.Element {
  const node = item.data;
  const isDirectory = node?.type === "directory";

  return (
    <span class="flex items-center">
      <span>{item.label}</span>
      {!isDirectory && node?.fileType && (
        <Badge variant="outline" class="ml-2 text-xs">
          {node.fileType}
        </Badge>
      )}
    </span>
  );
}

export function FileTree({ nodes, collapsedIds, onItemToggle }: IFileTreeProps): JSX.Element {
  const treeItems = convertToTreeItems(nodes);
  return (
    <Tree items={treeItems} collapsedIds={collapsedIds} onItemToggle={onItemToggle} renderLabel={renderFileLabel} />
  );
}
