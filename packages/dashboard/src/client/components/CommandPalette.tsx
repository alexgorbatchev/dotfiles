import { type JSX } from "preact";
import { useLocation } from "preact-iso";
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Search } from "../icons";

import type { IToolDetail } from "../../shared/types";
import { useFetch } from "../hooks/useFetch";

interface ISearchResult {
  tool: IToolDetail;
  matchType: "name" | "binary";
  matchedValue: string;
}

export function CommandPalette(): JSX.Element | null {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { route } = useLocation();
  const { data: tools } = useFetch<IToolDetail[]>("/tools");

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setIsOpen((previousValue) => !previousValue);
      }
      if (event.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  const results = useMemo((): ISearchResult[] => {
    if (!tools || !query.trim()) return [];

    const lowerQuery = query.toLowerCase();
    const matches: ISearchResult[] = [];

    for (const tool of tools) {
      if (tool.config.name.toLowerCase().includes(lowerQuery)) {
        matches.push({ tool, matchType: "name", matchedValue: tool.config.name });
        continue;
      }

      const binaries = tool.config.binaries || [];
      for (const binary of binaries) {
        const binaryName = typeof binary === "string" ? binary : binary.name;
        if (binaryName.toLowerCase().includes(lowerQuery)) {
          matches.push({ tool, matchType: "binary", matchedValue: binaryName });
          break;
        }
      }
    }

    return matches.slice(0, 10);
  }, [tools, query]);

  const navigateTo = useCallback(
    (result: ISearchResult) => {
      setIsOpen(false);
      route(`/tools/${encodeURIComponent(result.tool.config.name)}`);
    },
    [route],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((index) => Math.min(index + 1, results.length - 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((index) => Math.max(index - 1, 0));
      } else if (event.key === "Enter" && results[selectedIndex]) {
        event.preventDefault();
        navigateTo(results[selectedIndex]);
      }
    },
    [results, selectedIndex, navigateTo],
  );

  if (!isOpen) return null;

  return (
    <div data-testid="CommandPalette" class="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      <div class="fixed inset-0 bg-black/50" onClick={() => setIsOpen(false)} />

      <div class="relative w-full max-w-lg overflow-hidden rounded-lg border border-border bg-card shadow-lg">
        <div class="flex items-center border-b border-border px-3">
          <Search class="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onInput={(event) => {
              setQuery((event.target as HTMLInputElement).value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search tools by name or binary..."
            class="flex-1 bg-transparent px-3 py-3 focus:outline-none"
          />
          <kbd class="bg-muted px-1.5 py-0.5 text-xs text-muted-foreground rounded">esc</kbd>
        </div>

        {query.trim() && (
          <div class="max-h-80 overflow-y-auto">
            {results.length === 0 ? (
              <div class="px-4 py-8 text-center text-muted-foreground">No tools found</div>
            ) : (
              <ul>
                {results.map((result, index) => (
                  <li
                    key={result.tool.config.name}
                    class={`px-4 py-2 cursor-pointer flex items-center justify-between ${
                      index === selectedIndex ? "bg-accent" : "hover:bg-accent/50"
                    }`}
                    onClick={() => navigateTo(result)}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    <div>
                      <div class="font-medium">{result.tool.config.name}</div>
                      {result.matchType === "binary" && (
                        <div class="text-sm text-muted-foreground">
                          binary: <code class="bg-muted px-1 rounded">{result.matchedValue}</code>
                        </div>
                      )}
                    </div>
                    <span class="text-xs text-muted-foreground">{result.tool.config.installationMethod}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {!query.trim() && (
          <div class="px-4 py-3 text-sm text-muted-foreground">Type to search tools by name or binary...</div>
        )}
      </div>
    </div>
  );
}
