import { Search } from 'lucide-preact';
import { type JSX } from 'preact';
import { useLocation } from 'preact-iso';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';

import type { IToolDetail } from '../../shared/types';
import { useFetch } from '../hooks/useFetch';

interface SearchResult {
  tool: IToolDetail;
  matchType: 'name' | 'binary';
  matchedValue: string;
}

export function CommandPalette(): JSX.Element | null {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { route } = useLocation();
  const { data: tools } = useFetch<IToolDetail[]>('/tools');

  // Handle keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  // Search results
  const results = useMemo((): SearchResult[] => {
    if (!tools || !query.trim()) return [];

    const lowerQuery = query.toLowerCase();
    const matches: SearchResult[] = [];

    for (const tool of tools) {
      // Match by tool name
      if (tool.config.name.toLowerCase().includes(lowerQuery)) {
        matches.push({ tool, matchType: 'name', matchedValue: tool.config.name });
        continue;
      }

      // Match by binary names
      const binaries = tool.config.binaries || [];
      for (const binary of binaries) {
        const binaryName = typeof binary === 'string' ? binary : binary.name;
        if (binaryName.toLowerCase().includes(lowerQuery)) {
          matches.push({ tool, matchType: 'binary', matchedValue: binaryName });
          break;
        }
      }
    }

    return matches.slice(0, 10);
  }, [tools, query]);

  // Navigate to selected tool
  const navigateTo = useCallback(
    (result: SearchResult) => {
      setIsOpen(false);
      route(`/tools/${encodeURIComponent(result.tool.config.name)}`);
    },
    [route],
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && results[selectedIndex]) {
        e.preventDefault();
        navigateTo(results[selectedIndex]);
      }
    },
    [results, selectedIndex, navigateTo],
  );

  if (!isOpen) return null;

  return (
    <div class='fixed inset-0 z-50 flex items-start justify-center pt-[20vh]'>
      {/* Backdrop */}
      <div class='fixed inset-0 bg-black/50' onClick={() => setIsOpen(false)} />

      {/* Dialog */}
      <div class='relative w-full max-w-lg bg-card border border-border rounded-lg shadow-lg overflow-hidden'>
        {/* Search input */}
        <div class='flex items-center border-b border-border px-3'>
          <Search class='w-4 h-4 text-muted-foreground' />
          <input
            ref={inputRef}
            type='text'
            value={query}
            onInput={(e) => {
              setQuery((e.target as HTMLInputElement).value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder='Search tools by name or binary...'
            class='flex-1 bg-transparent px-3 py-3 focus:outline-none'
          />
          <kbd class='text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded'>esc</kbd>
        </div>

        {/* Results */}
        {query.trim() && (
          <div class='max-h-80 overflow-y-auto'>
            {results.length === 0 ? <div class='px-4 py-8 text-center text-muted-foreground'>No tools found</div> : (
              <ul>
                {results.map((result, index) => (
                  <li
                    key={result.tool.config.name}
                    class={`px-4 py-2 cursor-pointer flex items-center justify-between ${
                      index === selectedIndex ? 'bg-accent' : 'hover:bg-accent/50'
                    }`}
                    onClick={() => navigateTo(result)}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    <div>
                      <div class='font-medium'>{result.tool.config.name}</div>
                      {result.matchType === 'binary' && (
                        <div class='text-sm text-muted-foreground'>
                          binary: <code class='bg-muted px-1 rounded'>{result.matchedValue}</code>
                        </div>
                      )}
                    </div>
                    <span class='text-xs text-muted-foreground'>{result.tool.config.installationMethod}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Footer hint */}
        {!query.trim() && (
          <div class='px-4 py-3 text-sm text-muted-foreground'>
            Type to search tools by name or binary...
          </div>
        )}
      </div>
    </div>
  );
}
