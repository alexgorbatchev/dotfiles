import { type ComponentChildren, type JSX } from "preact";
import { useId, useState } from "preact/hooks";
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
  const childrenId = useId();
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

  const content = (
    <span class="flex min-w-0 flex-1 items-center">
      {renderChevron()}
      {item.iconDecorator && (
        <span aria-hidden="true" class="flex-shrink-0 mr-1">
          {item.iconDecorator}
        </span>
      )}
      {item.icon && (
        <span aria-hidden="true" class={cn("flex-shrink-0", iconClassName)}>
          {item.icon}
        </span>
      )}
      <span class={cn("ml-2 flex-1 min-w-0 [overflow-wrap:anywhere]", hasChildren && "font-medium")}>
        {renderLabel ? renderLabel(item) : item.label}
      </span>
    </span>
  );

  return (
    <div data-testid="TreeItem" class="min-w-0">
      <div
        class="flex min-w-0 flex-col gap-2 py-1 rounded text-sm group sm:flex-row sm:items-center"
        style={{ paddingLeft: `${indent}px` }}
      >
        {hasChildren || onItemClick ? (
          <button
            type="button"
            class="flex min-h-11 min-w-0 flex-1 items-center rounded text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring sm:min-h-6"
            aria-expanded={hasChildren ? isExpanded : undefined}
            aria-controls={hasChildren ? childrenId : undefined}
            onClick={handleClick}
          >
            {content}
          </button>
        ) : (
          content
        )}
        {renderActions && <span class="flex min-w-0 flex-wrap gap-2 sm:ml-2 sm:shrink-0">{renderActions(item)}</span>}
      </div>
      {hasChildren && isExpanded && (
        <div id={childrenId}>
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
