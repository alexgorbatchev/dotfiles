import { type JSX } from "preact";
import { useLocation } from "preact-iso";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { Search } from "../icons";

import type { IToolDetail } from "../../shared/types";
import { useFetch } from "../hooks/useFetch";
import { RequestStateNotice } from "./RequestStateNotice";
import { Button } from "./ui/Button";

interface ISearchResult {
  tool: IToolDetail;
  matchType: "name" | "binary";
  matchedValue: string;
}

interface ICommandPaletteProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ isOpen, onOpenChange }: ICommandPaletteProps): JSX.Element {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeOptionRef = useRef<HTMLLIElement>(null);
  const id = useId();
  const listId = `${id}-results`;
  const { route } = useLocation();
  const { data: tools, loading, error, refetch } = useFetch<IToolDetail[]>("/tools");
  const searchTerm = query.trim().toLowerCase();

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!dialogRef.current?.open);
      }
    };
    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, [onOpenChange]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!isOpen || !dialog) return;
    const launcher = document.activeElement;
    setQuery("");
    setSelectedIndex(0);
    dialog.showModal();
    inputRef.current?.focus();
    return () => {
      dialog.close();
      if (launcher instanceof HTMLElement && launcher.isConnected) launcher.focus();
    };
  }, [isOpen]);

  const results = useMemo((): ISearchResult[] => {
    if (!tools || !searchTerm) return [];
    return tools.flatMap((tool): ISearchResult[] => {
      if (tool.config.name.toLowerCase().includes(searchTerm)) {
        return [{ tool, matchType: "name", matchedValue: tool.config.name }];
      }
      for (const binary of tool.config.binaries ?? []) {
        const name = typeof binary === "string" ? binary : binary.name;
        if (name.toLowerCase().includes(searchTerm)) {
          return [{ tool, matchType: "binary", matchedValue: name }];
        }
      }
      return [];
    });
  }, [tools, searchTerm]);
  const activeIndex = Math.min(selectedIndex, Math.max(results.length - 1, 0));
  const activeId = results.length > 0 ? `${id}-option-${activeIndex}` : undefined;

  useEffect(() => {
    if (isOpen) activeOptionRef.current?.scrollIntoView({ block: "nearest" });
  }, [isOpen, activeIndex, results]);

  function navigateTo(result: ISearchResult): void {
    onOpenChange(false);
    route(`/tools/${encodeURIComponent(result.tool.config.name)}`);
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setSelectedIndex(Math.max(0, Math.min(activeIndex + direction, results.length - 1)));
    } else if (event.key === "Enter" && results[activeIndex]) {
      event.preventDefault();
      navigateTo(results[activeIndex]);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      data-testid="CommandPalette"
      aria-labelledby={`${id}-title`}
      class="fixed inset-x-0 top-0 mx-auto mt-[10dvh] max-h-[80dvh] w-[calc(100vw-2rem)] max-w-lg overflow-hidden rounded-lg border border-border bg-card p-0 text-foreground shadow-lg backdrop:bg-black/50"
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <div class="min-w-0">
        <div class="flex items-center justify-between gap-2 px-4 pt-3">
          <h2 id={`${id}-title`} class="font-semibold">
            Search tools
          </h2>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} aria-label="Close search">
            Close
          </Button>
        </div>
        <div class="flex min-w-0 items-center gap-2 border-b border-border px-4">
          <Search class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <label for={`${id}-input`} class="sr-only">
            Search tools by name or binary
          </label>
          <input
            ref={inputRef}
            id={`${id}-input`}
            type="search"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={isOpen && results.length > 0}
            aria-controls={listId}
            aria-activedescendant={activeId}
            autoComplete="off"
            value={query}
            onInput={(event) => {
              setQuery(event.currentTarget.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Tool name or binary"
            class="min-h-11 min-w-0 flex-1 rounded bg-transparent py-3 text-base focus-visible:outline-2 focus-visible:outline-ring"
          />
        </div>
        <div class="max-h-[55dvh] overflow-y-auto overscroll-contain">
          <RequestStateNotice
            label="Tools"
            loading={loading}
            error={error}
            hasData={tools !== null}
            onRetry={refetch}
          />
          {searchTerm && results.length > 0 && (
            <p role="status" class="px-4 py-2 text-sm text-muted-foreground">
              {results.length} {results.length === 1 ? "match" : "matches"}
            </p>
          )}
          <ul id={listId} role="listbox" aria-label="Matching tools">
            {results.map((result, index) => (
              <li
                key={result.tool.config.name}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                ref={index === activeIndex ? activeOptionRef : undefined}
                class={`flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3 ${index === activeIndex ? "bg-accent" : "hover:bg-accent/50"}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => navigateTo(result)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <span class="min-w-0 [overflow-wrap:anywhere]">
                  <span class="block font-medium">{result.tool.config.name}</span>
                  {result.matchType === "binary" && (
                    <span class="block text-sm text-muted-foreground">
                      Binary: <code>{result.matchedValue}</code>
                    </span>
                  )}
                </span>
                <span class="text-sm text-muted-foreground">{result.tool.config.installationMethod}</span>
              </li>
            ))}
          </ul>
          {!loading && !error && tools !== null && searchTerm && results.length === 0 && (
            <p role="status" class="px-4 py-6 text-muted-foreground">
              No tools found
            </p>
          )}
          {!searchTerm && (
            <p class="px-4 py-3 text-sm text-muted-foreground">Type to search tools by name or binary.</p>
          )}
        </div>
      </div>
    </dialog>
  );
}
