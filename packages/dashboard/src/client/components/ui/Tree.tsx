import { type ComponentChildren, type JSX } from "preact";
import { useState } from "preact/hooks";
import { ChevronDown, ChevronRight } from "../../icons";

import { cn } from "../../lib/utils";

export interface ITreeItemData<T = unknown> {
  id: string;
  label: string;
  icon?: JSX.Element;
  iconDecorator?: JSX.Element;
  children?: ITreeItemData<T>[];
  data?: T;
}

export interface ITreeItemProps<T = unknown> {
  item: ITreeItemData<T>;
  depth?: number;
  defaultExpanded?: boolean;
  renderActions?: (item: ITreeItemData<T>) => ComponentChildren;
  renderLabel?: (item: ITreeItemData<T>) => ComponentChildren;
  onItemClick?: (item: ITreeItemData<T>) => void;
  iconClassName?: string;
}

export interface ITreeProps<T = unknown> {
  items: ITreeItemData<T>[];
  defaultExpanded?: boolean;
  renderActions?: (item: ITreeItemData<T>) => ComponentChildren;
  renderLabel?: (item: ITreeItemData<T>) => ComponentChildren;
  onItemClick?: (item: ITreeItemData<T>) => void;
  iconClassName?: string;
  class?: string;
}

export type TreeItemData<T = unknown> = ITreeItemData<T>;
export type TreeItemProps<T = unknown> = ITreeItemProps<T>;
export type TreeProps<T = unknown> = ITreeProps<T>;

export function TreeItem<T = unknown>({
  item,
  depth = 0,
  defaultExpanded = true,
  renderActions,
  renderLabel,
  onItemClick,
  iconClassName,
}: ITreeItemProps<T>): JSX.Element {
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
      return <span class="w-4 mr-1" />;
    }
    return (
      <span class="w-4 mr-1 flex items-center justify-center">
        {isExpanded ? (
          <ChevronDown class="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight class="h-4 w-4 text-muted-foreground" />
        )}
      </span>
    );
  }

  return (
    <div data-testid="TreeItem">
      <div
        class="flex items-center py-1 hover:bg-accent rounded cursor-pointer text-sm group"
        style={{ paddingLeft: `${indent}px` }}
        onClick={handleClick}
      >
        {renderChevron()}
        {item.iconDecorator && <span class="flex-shrink-0 mr-1">{item.iconDecorator}</span>}
        {item.icon && <span class={cn("flex-shrink-0", iconClassName)}>{item.icon}</span>}
        <span class={cn("ml-2 flex-1 min-w-0", hasChildren && "font-medium")}>
          {renderLabel ? renderLabel(item) : item.label}
        </span>
        {renderActions && (
          <span class="ml-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
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

export function Tree<T = unknown>({
  items,
  defaultExpanded = true,
  renderActions,
  renderLabel,
  onItemClick,
  iconClassName,
  class: className,
}: ITreeProps<T>): JSX.Element {
  return (
    <div data-testid="Tree" class={cn("space-y-1", className)}>
      {items.map((item) => (
        <TreeItem
          key={item.id}
          item={item}
          defaultExpanded={defaultExpanded}
          renderLabel={renderLabel}
          renderActions={renderActions}
          onItemClick={onItemClick}
          iconClassName={iconClassName}
        />
      ))}
    </div>
  );
}
