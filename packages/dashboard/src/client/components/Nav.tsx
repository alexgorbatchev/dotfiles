import { Search } from 'lucide-preact';
import { type JSX } from 'preact';
import { useLocation } from 'preact-iso';

import { cn } from '../lib/utils';
import { Button } from './ui/Button';

const links = [
  { path: '/', label: '🏠 Home' },
  { path: '/health', label: '🏥 Health' },
  { path: '/settings', label: '⚙️ Settings' },
];

export function Nav(): JSX.Element {
  const { url } = useLocation();

  const openCommandPalette = () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
  };

  return (
    <nav class='bg-card border-b border-border'>
      <div class='max-w-7xl mx-auto px-4'>
        <div class='flex items-center justify-between h-14'>
          <div class='flex items-center space-x-4'>
            <span class='text-xl font-bold text-primary'>⚡ Dotfiles</span>
            <div class='flex space-x-1'>
              {links.map((link) => {
                const isActive = url === link.path || (link.path !== '/' && url.startsWith(link.path));
                return (
                  <Button
                    key={link.path}
                    variant={isActive ? 'secondary' : 'ghost'}
                    size='sm'
                    asChild
                  >
                    <a href={link.path} class={cn(isActive && 'pointer-events-none')}>
                      {link.label}
                    </a>
                  </Button>
                );
              })}
            </div>
          </div>
          <div class='flex items-center space-x-4'>
            <button
              onClick={openCommandPalette}
              class='flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground bg-input border border-border rounded-md hover:bg-accent transition-colors'
            >
              <Search class='w-4 h-4' />
              <span>Search...</span>
              <kbd class='text-xs bg-muted px-1.5 py-0.5 rounded'>⌘K</kbd>
            </button>
            <div class='flex items-center space-x-2 text-sm text-muted-foreground'>
              <span class='w-2 h-2 rounded-full bg-green-500' />
              Connected
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
