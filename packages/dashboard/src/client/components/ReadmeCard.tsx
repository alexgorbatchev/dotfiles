import { ExternalLink } from 'lucide-preact';
import { type JSX } from 'preact';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { useFetch } from '../hooks/useFetch';
import { TitledCard } from './ui/TitledCard';

interface ReadmeCardProps {
  toolName: string;
  repo: string;
}

export function ReadmeCard({ toolName, repo }: ReadmeCardProps): JSX.Element {
  const { data, loading, error } = useFetch<{ content: string; }>(
    `/tools/${encodeURIComponent(toolName)}/readme`,
    [toolName],
  );

  if (loading) {
    return (
      <TitledCard title='README'>
        <div class='text-muted-foreground text-center py-8'>Loading README...</div>
      </TitledCard>
    );
  }

  if (error || !data?.content) {
    return (
      <TitledCard title='README'>
        <div class='text-muted-foreground text-center py-8'>
          <p class='mb-2'>README not available</p>
          <a
            href={`https://github.com/${repo}#readme`}
            target='_blank'
            rel='noopener noreferrer'
            class='text-sm text-blue-500 hover:underline inline-flex items-center gap-1'
          >
            View on GitHub <ExternalLink class='h-3 w-3' />
          </a>
        </div>
      </TitledCard>
    );
  }

  return (
    <TitledCard
      title='README'
      action={
        <a
          href={`https://github.com/${repo}#readme`}
          target='_blank'
          rel='noopener noreferrer'
          class='text-sm text-blue-500 hover:underline inline-flex items-center gap-1'
        >
          View on GitHub <ExternalLink class='h-3 w-3' />
        </a>
      }
    >
      <div class='max-h-[600px] overflow-auto prose prose-sm dark:prose-invert max-w-none'>
        <Markdown remarkPlugins={[remarkGfm]}>{data.content}</Markdown>
      </div>
    </TitledCard>
  );
}
