import { useLocation } from 'preact-iso';

const links = [
  { path: '/', label: '🏠 Dashboard' },
  { path: '/tools', label: '📦 Tools' },
  { path: '/health', label: '🏥 Health' },
  { path: '/settings', label: '⚙️ Settings' },
];

export function Nav() {
  const { url } = useLocation();

  return (
    <nav class='bg-gray-800 border-b border-gray-700'>
      <div class='max-w-7xl mx-auto px-4'>
        <div class='flex items-center justify-between h-14'>
          <div class='flex items-center space-x-4'>
            <span class='text-xl font-bold text-blue-400'>⚡ Dotfiles</span>
            <div class='flex space-x-1'>
              {links.map((link) => (
                <a
                  key={link.path}
                  href={link.path}
                  class={`nav-link ${
                    url === link.path || (link.path !== '/' && url.startsWith(link.path)) ? 'active' : ''
                  }`}
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
          <div class='flex items-center space-x-2 text-sm text-gray-400'>
            <span class='w-2 h-2 rounded-full bg-green-500' />
            Connected
          </div>
        </div>
      </div>
    </nav>
  );
}
