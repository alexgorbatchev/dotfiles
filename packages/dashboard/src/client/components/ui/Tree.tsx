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
  collapsedIds?: ReadonlySet<string>;
  renderActions?: (item: ITreeItemData<T>) => ComponentChildren;
  renderLabel?: (item: ITreeItemData<T>) => ComponentChildren;
  onItemToggle?: (item: ITreeItemData<T>, nextExpanded: boolean) => void;
  onItemClick?: (item: ITreeItemData<T>) => void;
  iconClassName?: string;
}

export interface ITreeProps<T = unknown> {
  items: ITreeItemData<T>[];
  defaultExpanded?: boolean;
  collapsedIds?: ReadonlySet<string>;
  renderActions?: (item: ITreeItemData<T>) => ComponentChildren;
  renderLabel?: (item: ITreeItemData<T>) => ComponentChildren;
  onItemToggle?: (item: ITreeItemData<T>, nextExpanded: boolean) => void;
  onItemClick?: (item: ITreeItemData<T>) => void;
  iconClassName?: string;
  class?: string;
}

export function TreeItem<T = unknown>({
  item,
  depth = 0,
  defaultExpanded = true,
  collapsedIds,
  renderActions,
  renderLabel,
  onItemToggle,
  onItemClick,
  iconClassName,
}: ITreeItemProps<T>): JSX.Element {
  const [isExpandedState, setIsExpandedState] = useState(defaultExpanded);
  const hasChildren = item.children && item.children.length > 0;
  const isControlled = collapsedIds !== undefined;
  const isExpanded = hasChildren ? (isControlled ? !collapsedIds.has(item.id) : isExpandedState) : false;
  const indent = depth * 16;

  function handleClick(): void {
    if (hasChildren) {
      const nextExpanded = !isExpanded;

      if (isControlled) {
        onItemToggle?.(item, nextExpanded);
      } else {
        setIsExpandedState(nextExpanded);
        onItemToggle?.(item, nextExpanded);
      }
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
              collapsedIds={collapsedIds}
              renderActions={renderActions}
              renderLabel={renderLabel}
              onItemToggle={onItemToggle}
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
  collapsedIds,
  renderActions,
  renderLabel,
  onItemToggle,
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
          collapsedIds={collapsedIds}
          renderLabel={renderLabel}
          renderActions={renderActions}
          onItemToggle={onItemToggle}
          onItemClick={onItemClick}
          iconClassName={iconClassName}
        />
      ))}
    </div>
  );
}
