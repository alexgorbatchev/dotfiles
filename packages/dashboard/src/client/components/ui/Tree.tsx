import { ChevronDown, ChevronRight } from 'lucide-preact';
import { type ComponentChildren, type JSX } from 'preact';
import { useState } from 'preact/hooks';

import { cn } from '../../lib/utils';

interface TreeItemData<T = unknown> {
  id: string;
  label: string;
  icon?: JSX.Element;
  children?: TreeItemData<T>[];
  data?: T;
}

interface TreeItemProps<T = unknown> {
  item: TreeItemData<T>;
  depth?: number;
  defaultExpanded?: boolean;
  renderActions?: (item: TreeItemData<T>) => ComponentChildren;
  renderLabel?: (item: TreeItemData<T>) => ComponentChildren;
  onItemClick?: (item: TreeItemData<T>) => void;
  iconClassName?: string;
}

interface TreeProps<T = unknown> {
  items: TreeItemData<T>[];
  defaultExpanded?: boolean;
  renderActions?: (item: TreeItemData<T>) => ComponentChildren;
  renderLabel?: (item: TreeItemData<T>) => ComponentChildren;
  onItemClick?: (item: TreeItemData<T>) => void;
  iconClassName?: string;
  class?: string;
}

function TreeItem<T = unknown>({
  item,
  depth = 0,
  defaultExpanded = true,
  renderActions,
  renderLabel,
  onItemClick,
  iconClassName,
}: TreeItemProps<T>): JSX.Element {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const hasChildren = item.children && item.children.length > 0;
  const indent = depth * 16;

  function handleClick(): void {
    if (hasChildren) {
      setIsExpanded(!isExpanded);
    }
    onItemClick?.(item);
  }

  function renderChevron(): JSX.Element {
    if (!hasChildren) {
      return <span class='w-4 mr-1' />;
    }
    return (
      <span class='w-4 mr-1 flex items-center justify-center'>
        {isExpanded ?
          <ChevronDown class='h-4 w-4 text-muted-foreground' /> :
          <ChevronRight class='h-4 w-4 text-muted-foreground' />}
      </span>
    );
  }

  return (
    <div>
      <div
        class='flex items-center py-1 hover:bg-accent rounded cursor-pointer text-sm group'
        style={{ paddingLeft: `${indent}px` }}
        onClick={handleClick}
      >
        {renderChevron()}
        {item.icon && <span class={cn('flex-shrink-0', iconClassName)}>{item.icon}</span>}
        <span class={cn('ml-2 flex-1 min-w-0', hasChildren && 'font-medium')}>
          {renderLabel ? renderLabel(item) : item.label}
        </span>
        {renderActions && (
          <span class='ml-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity'>
            {renderActions(item)}
          </span>
        )}
      </div>
      {hasChildren && isExpanded && (
        <div>
          {item.children?.map((child) => (
            <TreeItem
              key={child.id}
              item={child}
              depth={depth + 1}
              defaultExpanded={defaultExpanded}
              renderActions={renderActions}
              renderLabel={renderLabel}
              onItemClick={onItemClick}
              iconClassName={iconClassName}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Tree<T = unknown>({
  items,
  defaultExpanded = true,
  renderActions,
  renderLabel,
  onItemClick,
  iconClassName,
  class: className,
}: TreeProps<T>): JSX.Element {
  return (
    <div class={cn('space-y-1', className)}>
      {items.map((item) => (
        <TreeItem
          key={item.id}
          item={item}
          defaultExpanded={defaultExpanded}
          renderActions={renderActions}
          renderLabel={renderLabel}
          onItemClick={onItemClick}
          iconClassName={iconClassName}
        />
      ))}
    </div>
  );
}

export { Tree, TreeItem };
export type { TreeItemData, TreeItemProps, TreeProps };
