import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, _ctx) =>
  install('github-release', {
    repo: 'caddyserver/caddy',
    assetPattern: 'caddy_*.tar.gz',
  }).bin('caddy')
);
