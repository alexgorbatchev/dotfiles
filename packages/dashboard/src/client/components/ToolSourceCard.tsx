import { Check, Code, Copy, ExternalLink } from 'lucide-preact';
import { type JSX } from 'preact';
import { useCallback, useState } from 'preact/hooks';
import { ShikiHighlighter } from 'react-shiki';

import { useFetch } from '../hooks/useFetch';
import { TitledCard } from './ui/TitledCard';

interface ToolSourceCardProps {
  toolName: string;
}

export function ToolSourceCard({ toolName }: ToolSourceCardProps): JSX.Element {
  const { data, loading, error } = useFetch<{ content: string; filePath: string; }>(
    `/tools/${encodeURIComponent(toolName)}/source`,
    [toolName],
  );

  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!data?.content) return;
    await navigator.clipboard.writeText(data.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [data?.content]);

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
      action={
        <div class='flex items-center gap-2'>
          <button
            onClick={handleCopy}
            class='text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors'
            title='Copy source code'
          >
            {copied ?
              <Check class='h-4 w-4 text-green-500' /> :
              <Copy class='h-4 w-4' />}
          </button>
          <a
            href={`vscode://file/${data.filePath}`}
            class='text-sm text-blue-500 hover:underline inline-flex items-center gap-1'
            title='Open in VS Code'
          >
            <ExternalLink class='h-3 w-3' />
          </a>
        </div>
      }
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
