import { type JSX } from 'preact';
import { FolderCog } from '../icons';

import type { IConfigSummary } from '../../shared/types';
import { TitledCard } from '../components/ui/TitledCard';
import { useFetch } from '../hooks/useFetch';

export function Settings(): JSX.Element {
  const { data: config, loading } = useFetch<IConfigSummary>('/config');

  if (loading) {
    return (
      <div class='flex items-center justify-center h-64'>
        <div class='text-muted-foreground'>Loading...</div>
      </div>
    );
  }

  const paths = [
    { label: 'Dotfiles Directory', value: config?.dotfilesDir },
    { label: 'Generated Directory', value: config?.generatedDir },
    { label: 'Binaries Directory', value: config?.binariesDir },
    { label: 'Target Directory', value: config?.targetDir },
    { label: 'Tool Configs Directory', value: config?.toolConfigsDir },
  ];

  return (
    <div class='space-y-6'>
      <TitledCard title='Project Paths' icon={<FolderCog class='h-4 w-4' />}>
        <div class='space-y-4'>
          {paths.map((p, i) => (
            <div key={i}>
              <div class='text-sm text-muted-foreground mb-1'>{p.label}</div>
              <code class='text-sm bg-muted px-3 py-2 rounded block overflow-x-auto'>
                {p.value || 'Not configured'}
              </code>
            </div>
          ))}
        </div>
      </TitledCard>
    </div>
  );
}
