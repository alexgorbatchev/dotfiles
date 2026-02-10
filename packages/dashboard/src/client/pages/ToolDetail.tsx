import { File, History, Info } from 'lucide-preact';
import { type JSX } from 'preact';
import { useMemo } from 'preact/hooks';

import type { ISerializableToolConfig, IToolDetail, IToolHistory } from '../../shared/types';
import { InstallMethodBadge } from '../components/InstallMethodBadge';
import { ReadmeCard } from '../components/ReadmeCard';
import { StatusBadge } from '../components/StatusBadge';
import { ToolHistory } from '../components/ToolHistory';
import { FileTree } from '../components/TreeNode';
import { Button } from '../components/ui/Button';
import { TitledCard } from '../components/ui/TitledCard';
import { useFetch } from '../hooks/useFetch';
import { buildTreeForTool } from '../utils/tree';
import {
  buildBinaryToToolMap,
  findDependentTools,
  getBinaryName,
  getSourceInfo,
} from './tool-detail-utils';

function getSourceDisplay(config: ISerializableToolConfig): JSX.Element | null {
  const sourceInfo = getSourceInfo(config);
  if (!sourceInfo) return null;

  return (
    <div class='flex items-center gap-2'>
      <span class='text-sm text-muted-foreground w-24'>Source</span>
      {sourceInfo.url ?
        (
          <a
            href={sourceInfo.url}
            target='_blank'
            rel='noopener noreferrer'
            class='text-sm text-blue-500 hover:underline break-all'
          >
            {sourceInfo.value}
          </a>
        ) :
        (
          <span class='text-sm font-medium break-all'>
            {sourceInfo.value}
          </span>
        )}
    </div>
  );
}

interface ToolDetailProps {
  params: { name: string; };
}

export function ToolDetail({ params }: ToolDetailProps): JSX.Element {
  const toolName = decodeURIComponent(params.name);
  const { data: tools, loading: toolsLoading } = useFetch<IToolDetail[]>('/tools', [toolName]);
  const { data: history, loading: historyLoading } = useFetch<IToolHistory>(
    `/tools/${encodeURIComponent(toolName)}/history`,
    [toolName],
  );

  const tool = tools?.find((t) => t.config.name === toolName) || null;
  const loading = toolsLoading || historyLoading;

  const binaryToToolMap = useMemo(() => buildBinaryToToolMap(tools ?? []), [tools]);

  const currentToolBinaries = useMemo(
    () => (tool?.config.binaries ?? []).map(getBinaryName),
    [tool],
  );

  const dependentTools = useMemo(
    () => findDependentTools(tools ?? [], currentToolBinaries),
    [tools, currentToolBinaries],
  );

  if (loading) {
    return (
      <div class='flex items-center justify-center h-64'>
        <div class='text-muted-foreground'>Loading...</div>
      </div>
    );
  }

  if (!tool) {
    return (
      <div class='text-center py-8'>
        <div class='text-muted-foreground mb-4'>Tool not found</div>
        <Button variant='link' asChild>
          <a href='/'>← Back to Home</a>
        </Button>
      </div>
    );
  }

  const fileRoots = buildTreeForTool(tool.files || []);

  return (
    <div class='space-y-4'>
      {/* Back button */}
      <Button variant='ghost' size='sm' asChild>
        <a href='/'>← Back to Home</a>
      </Button>

      {/* Header */}
      <div class='flex items-center gap-4'>
        <h1 class='text-2xl font-bold'>{tool.config.name}</h1>
        <StatusBadge status={tool.runtime.status} />
      </div>

      {/* Overview Section */}
      <TitledCard title='Overview' icon={<Info class='h-4 w-4' />}>
        <div class='space-y-3'>
          <div class='flex items-center gap-2'>
            <span class='text-sm text-muted-foreground w-24'>Method</span>
            <InstallMethodBadge
              method={tool.config.installationMethod}
              ghCli={tool.config.installParams.ghCli}
            />
          </div>
          {getSourceDisplay(tool.config)}
          <div class='flex items-center gap-2'>
            <span class='text-sm text-muted-foreground w-24'>Version</span>
            <span class='font-medium'>
              {tool.runtime.installedVersion || tool.config.version || 'Unknown'}
            </span>
          </div>
          <div class='flex items-center gap-2'>
            <span class='text-sm text-muted-foreground w-24'>Installed</span>
            <span class='font-medium'>
              {tool.runtime.installedAt ? new Date(tool.runtime.installedAt).toLocaleDateString() : 'Not installed'}
            </span>
          </div>
          {tool.config.hostname && (
            <div class='flex items-center gap-2'>
              <span class='text-sm text-muted-foreground w-24'>Hostname</span>
              <code class='text-sm font-mono bg-muted px-1.5 py-0.5 rounded'>
                {tool.config.hostname}
              </code>
            </div>
          )}
          {tool.config.dependencies && tool.config.dependencies.length > 0 && (
            <div class='flex items-start gap-2'>
              <span class='text-sm text-muted-foreground w-24'>Depends on</span>
              <div class='flex flex-wrap gap-2'>
                {tool.config.dependencies.map((binaryName, i) => {
                  const linkedToolName = binaryToToolMap.get(binaryName);
                  return (
                    <a
                      key={i}
                      href={`/tools/${encodeURIComponent(linkedToolName ?? binaryName)}`}
                      class='text-sm text-blue-500 hover:underline'
                    >
                      {linkedToolName ?? binaryName}
                    </a>
                  );
                })}
              </div>
            </div>
          )}
          {dependentTools.length > 0 && (
            <div class='flex items-start gap-2'>
              <span class='text-sm text-muted-foreground w-24'>Required by</span>
              <div class='flex flex-wrap gap-2'>
                {dependentTools.map((depTool, i) => (
                  <a
                    key={i}
                    href={`/tools/${encodeURIComponent(depTool.config.name)}`}
                    class='text-sm text-blue-500 hover:underline'
                  >
                    {depTool.config.name}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </TitledCard>

      {/* Files Section */}
      <TitledCard title='Files' icon={<File class='h-4 w-4' />}>
        {(tool.files?.length || 0) > 0 ?
          <FileTree nodes={fileRoots} /> :
          <div class='text-muted-foreground text-center py-4'>No files tracked</div>}
      </TitledCard>

      {/* History Section */}
      <TitledCard title='History' icon={<History class='h-4 w-4' />}>
        <ToolHistory
          entries={history?.entries ?? []}
          installedAt={history?.installedAt ?? null}
          dotfilesDir={history?.dotfilesDir ?? ''}
        />
      </TitledCard>

      {/* README Section - only for installers with GitHub repos */}
      {tool.config.installParams.repo && (
        <ReadmeCard toolName={tool.config.name} repo={tool.config.installParams.repo} />
      )}
    </div>
  );
}
