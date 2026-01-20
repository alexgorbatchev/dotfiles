import { useLocation } from 'preact-iso';
import { useCallback, useEffect, useState } from 'preact/hooks';
import type { IToolDetail } from '../../shared/types';
import { fetchApi } from '../api';
import { TreeNode } from '../components/TreeNode';
import { buildTreeForTool } from '../utils/tree';

export function Tools() {
  const { url } = useLocation();
  const [tools, setTools] = useState<IToolDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'files'>('grid');

  const getInitialFilters = useCallback(() => {
    const params = new URLSearchParams(url.split('?')[1] || '');
    return {
      search: params.get('search') || '',
      method: params.get('method') || '',
    };
  }, [url]);

  const [filter, setFilter] = useState(() => getInitialFilters().search);
  const [methodFilter, setMethodFilter] = useState(() => getInitialFilters().method);

  const updateUrlParams = useCallback(
    (search: string, method: string) => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (method) params.set('method', method);
      const queryString = params.toString();
      const newUrl = '/tools' + (queryString ? '?' + queryString : '');
      window.history.replaceState({}, '', newUrl);
    },
    [],
  );

  useEffect(() => {
    updateUrlParams(filter, methodFilter);
  }, [filter, methodFilter, updateUrlParams]);

  useEffect(() => {
    fetchApi<IToolDetail[]>('/tools')
      .then((data) => {
        setTools(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load tools:', err);
        setLoading(false);
      });
  }, []);

  const filteredTools = tools.filter((tool) => {
    const matchesSearch = !filter || tool.name.toLowerCase().includes(filter.toLowerCase());
    const matchesMethod = !methodFilter || tool.installMethod === methodFilter;
    return matchesSearch && matchesMethod;
  });

  const methods = [...new Set(tools.map((t) => t.installMethod).filter(Boolean))] as string[];
  const totalFiles = tools.reduce((sum, t) => sum + (t.files?.length || 0), 0);
  const installedCount = tools.filter((t) => t.status === 'installed').length;

  if (loading) {
    return (
      <div class='flex items-center justify-center h-64'>
        <div class='text-gray-400'>Loading...</div>
      </div>
    );
  }

  return (
    <div class='space-y-4'>
      {/* Stats row */}
      <div class='grid grid-cols-3 gap-4'>
        <div class='bg-gray-800 rounded-lg p-4 text-center'>
          <div class='text-2xl font-bold text-blue-400'>{tools.length}</div>
          <div class='text-gray-400 text-sm'>Total Tools</div>
        </div>
        <div class='bg-gray-800 rounded-lg p-4 text-center'>
          <div class='text-2xl font-bold text-green-400'>{installedCount}</div>
          <div class='text-gray-400 text-sm'>Installed</div>
        </div>
        <div class='bg-gray-800 rounded-lg p-4 text-center'>
          <div class='text-2xl font-bold text-purple-400'>{totalFiles}</div>
          <div class='text-gray-400 text-sm'>Files Tracked</div>
        </div>
      </div>

      {/* Toolbar */}
      <div class='flex items-center justify-between'>
        <div class='flex items-center space-x-4'>
          <input
            type='text'
            placeholder='Search tools...'
            value={filter}
            onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
            class='bg-gray-800 border border-gray-700 rounded px-3 py-2 focus:outline-none focus:border-blue-500'
          />
          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter((e.target as HTMLSelectElement).value)}
            class='bg-gray-800 border border-gray-700 rounded px-3 py-2'
          >
            <option value=''>All Methods</option>
            {methods.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <span class='text-gray-400 text-sm'>{filteredTools.length} tools</span>
        </div>
        <div class='flex items-center space-x-2'>
          <button
            onClick={() => setViewMode('grid')}
            class={`px-3 py-1 rounded text-sm ${
              viewMode === 'grid' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'
            }`}
          >
            ⊞ Grid
          </button>
          <button
            onClick={() => setViewMode('files')}
            class={`px-3 py-1 rounded text-sm ${
              viewMode === 'files' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'
            }`}
          >
            🌳 Files
          </button>
        </div>
      </div>

      {/* Grid view */}
      {viewMode === 'grid' && (
        <div class='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
          {filteredTools.map((tool) => (
            <a key={tool.name} href={`/tools/${encodeURIComponent(tool.name)}`} class='tool-card block'>
              <div class='flex items-center justify-between mb-2'>
                <span class='font-semibold'>{tool.name}</span>
                <span class={`w-2 h-2 rounded-full ${tool.status === 'installed' ? 'bg-green-500' : 'bg-gray-500'}`} />
              </div>
              <div class='text-sm text-gray-400'>{tool.version || 'Unknown version'}</div>
              <div class='mt-2 flex items-center justify-between'>
                <span class='text-xs px-2 py-1 rounded bg-gray-700'>{tool.installMethod || 'manual'}</span>
                {(tool.files?.length || 0) > 0 && <span class='text-xs text-gray-500'>{tool.files?.length} files</span>}
              </div>
            </a>
          ))}
        </div>
      )}

      {/* Files view */}
      {viewMode === 'files' && <ToolFilesView tools={filteredTools} />}

      {filteredTools.length === 0 && (
        <div class='text-center text-gray-400 py-8'>No tools found matching your criteria</div>
      )}
    </div>
  );
}

interface ToolFilesViewProps {
  tools: IToolDetail[];
}

function ToolFilesView({ tools }: ToolFilesViewProps) {
  const toolsWithFiles = tools.filter((t) => (t.files?.length || 0) > 0);

  if (toolsWithFiles.length === 0) {
    return <div class='bg-gray-800 rounded-lg p-4 text-center text-gray-400 py-8'>No files tracked yet</div>;
  }

  return (
    <div class='space-y-4'>
      {toolsWithFiles
        .toSorted((a, b) => a.name.localeCompare(b.name))
        .map((tool) => {
          const roots = buildTreeForTool(tool.files || []);
          return (
            <div key={tool.name} class='bg-gray-800 rounded-lg p-4'>
              {/* Tool header */}
              <a
                href={`/tools/${encodeURIComponent(tool.name)}`}
                class='flex items-center justify-between mb-3 cursor-pointer hover:bg-gray-700 -m-2 p-2 rounded'
              >
                <div class='flex items-center space-x-3'>
                  <span
                    class={`w-2 h-2 rounded-full ${tool.status === 'installed' ? 'bg-green-500' : 'bg-gray-500'}`}
                  />
                  <h3 class='font-semibold text-blue-400'>📦 {tool.name}</h3>
                  {tool.version && <span class='text-sm text-gray-400'>{tool.version}</span>}
                </div>
                <div class='flex items-center space-x-3'>
                  <span class='text-xs px-2 py-1 rounded bg-gray-700 text-gray-300'>
                    {tool.installMethod || 'manual'}
                  </span>
                  <span class='text-xs text-gray-500'>{tool.files?.length} files</span>
                  <span class='text-gray-400'>→</span>
                </div>
              </a>
              {/* File tree */}
              <div class='border-t border-gray-700 pt-3'>
                {roots.map((node, i) => <TreeNode key={i} node={node} />)}
              </div>
            </div>
          );
        })}
    </div>
  );
}
