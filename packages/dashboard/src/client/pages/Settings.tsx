import { useEffect, useState } from 'preact/hooks';
import type { IConfigSummary } from '../../shared/types';
import { fetchApi } from '../api';

export function Settings() {
  const [config, setConfig] = useState<IConfigSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchApi<IConfigSummary>('/config')
      .then((data) => {
        setConfig(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load config:', err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div class='flex items-center justify-center h-64'>
        <div class='text-gray-400'>Loading...</div>
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
      <div class='bg-gray-800 rounded-lg p-6'>
        <h2 class='text-lg font-semibold mb-4'>Project Paths</h2>
        <div class='space-y-4'>
          {paths.map((p, i) => (
            <div key={i}>
              <div class='text-sm text-gray-400 mb-1'>{p.label}</div>
              <code class='text-sm bg-gray-900 px-3 py-2 rounded block overflow-x-auto'>
                {p.value || 'Not configured'}
              </code>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
