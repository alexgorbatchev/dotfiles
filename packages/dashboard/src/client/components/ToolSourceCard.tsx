import { Code } from 'lucide-preact';
import { type JSX } from 'preact';
import { ShikiHighlighter } from 'react-shiki';

import { useFetch } from '../hooks/useFetch';
import { ExternalLinkButton } from './ui/ExternalLinkButton';
import { TitledCard } from './ui/TitledCard';

interface ToolSourceCardProps {
  toolName: string;
}

export function ToolSourceCard({ toolName }: ToolSourceCardProps): JSX.Element {
  const { data, loading, error } = useFetch<{ content: string; filePath: string; }>(
    `/tools/${encodeURIComponent(toolName)}/source`,
    [toolName],
  );

  if (loading) {
    return (
      <TitledCard title='Source' icon={<Code class='h-4 w-4' />}>
        <div class='text-muted-foreground text-center py-8'>Loading source...</div>
      </TitledCard>
    );
  }

  if (error || !data?.content) {
    return (
      <TitledCard title='Source' icon={<Code class='h-4 w-4' />}>
        <div class='text-muted-foreground text-center py-8'>Source not available</div>
      </TitledCard>
    );
  }

  const fileName = data.filePath.split('/').pop() ?? 'tool.ts';

  return (
    <TitledCard
      title='Source'
      icon={<Code class='h-4 w-4' />}
      action={<ExternalLinkButton href={`vscode://file/${data.filePath}`}>Open in VSCode</ExternalLinkButton>}
    >
      <div class='text-xs text-muted-foreground mb-2 font-mono'>{fileName}</div>
      <div class='overflow-x-auto rounded-md border border-border'>
        <ShikiHighlighter language='typescript' theme='github-dark'>
          {data.content.trim()}
        </ShikiHighlighter>
      </div>
    </TitledCard>
  );
}
