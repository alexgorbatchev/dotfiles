import { useState } from 'preact/hooks';
import type { IToolDetail } from '../../shared/types';
import { TreeNode } from '../components/TreeNode';
import { useFetch } from '../hooks/useFetch';
import { buildTreeForTool } from '../utils/tree';

interface ToolDetailProps {
  params: { name: string; };
}

export function ToolDetail({ params }: ToolDetailProps) {
  const toolName = decodeURIComponent(params.name);
  const { data: tools, loading } = useFetch<IToolDetail[]>('/tools', [toolName]);
  const [activeTab, setActiveTab] = useState<'overview' | 'files' | 'history'>('overview');

  const tool = tools?.find((t) => t.name === toolName) || null;

  if (loading) {
    return (
      <div class='flex items-center justify-center h-64'>
        <div class='text-gray-400'>Loading...</div>
      </div>
    );
  }

  if (!tool) {
    return (
      <div class='text-center py-8'>
        <div class='text-gray-400 mb-4'>Tool not found</div>
        <a href='/tools' class='text-blue-400 hover:underline'>
          ← Back to Tools
        </a>
      </div>
    );
  }

  const tabs: Array<'overview' | 'files' | 'history'> = ['overview', 'files', 'history'];
  const fileRoots = buildTreeForTool(tool.files || []);

  return (
    <div class='space-y-4'>
      {/* Back button */}
      <a href='/tools' class='text-gray-400 hover:text-white inline-block'>
        ← Back to Tools
      </a>

      {/* Header */}
      <div class='bg-gray-800 rounded-lg p-6'>
        <div class='flex items-center justify-between'>
          <div>
            <h1 class='text-2xl font-bold'>{tool.name}</h1>
            <p class='text-gray-400 mt-1'>Version: {tool.version || 'Unknown'}</p>
          </div>
          <span
            class={`status-badge ${
              tool.status === 'installed' ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-300'
            }`}
          >
            {tool.status === 'installed' ? '✓ Installed' : 'Not Installed'}
          </span>
        </div>
        <div class='grid grid-cols-3 gap-4 mt-6'>
          <div>
            <div class='text-sm text-gray-400'>Method</div>
            <div class='font-medium'>{tool.installMethod || 'Unknown'}</div>
          </div>
          <div>
            <div class='text-sm text-gray-400'>Installed</div>
            <div class='font-medium'>
              {tool.installedAt ? new Date(tool.installedAt).toLocaleDateString() : 'Unknown'}
            </div>
          </div>
          <div>
            <div class='text-sm text-gray-400'>Files</div>
            <div class='font-medium'>{tool.files?.length || 0} files</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div class='border-b border-gray-700'>
        <div class='flex space-x-4'>
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              class={`tab-button ${activeTab === tab ? 'active' : ''}`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div class='bg-gray-800 rounded-lg p-4'>
        {activeTab === 'overview' && (
          <div class='space-y-4'>
            {tool.installPath && (
              <div>
                <div class='text-sm text-gray-400 mb-1'>Install Path</div>
                <code class='text-sm bg-gray-900 px-2 py-1 rounded'>{tool.installPath}</code>
              </div>
            )}
            {(tool.binaryPaths?.length || 0) > 0 && (
              <div>
                <div class='text-sm text-gray-400 mb-1'>Binaries</div>
                <ul class='space-y-1'>
                  {tool.binaryPaths?.map((p, i) => (
                    <li key={i}>
                      <code class='text-sm bg-gray-900 px-2 py-1 rounded'>{p}</code>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {tool.downloadUrl && (
              <div>
                <div class='text-sm text-gray-400 mb-1'>Download URL</div>
                <code class='text-sm bg-gray-900 px-2 py-1 rounded break-all'>{tool.downloadUrl}</code>
              </div>
            )}
          </div>
        )}

        {activeTab === 'files' && (
          <div>
            {(tool.files?.length || 0) > 0 ?
              (
                <div class='space-y-2'>
                  {fileRoots.map((node, i) => <TreeNode key={i} node={node} />)}
                </div>
              ) :
              <div class='text-gray-400 text-center py-4'>No files tracked</div>}
          </div>
        )}

        {activeTab === 'history' && <div class='text-gray-400 text-center py-4'>Installation history coming soon</div>}
      </div>
    </div>
  );
}
