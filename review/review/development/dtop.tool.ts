import { defineTool } from '@gitea/dotfiles';

/**
 * dtop - Terminal-based Docker container monitoring dashboard with real-time
 * CPU and memory metrics across multiple hosts. Supports local, SSH, TCP, and
 * TLS connections with Dozzle integration for log streaming.
 *
 * https://github.com/amir20/dtop
 */
export default defineTool((install, _ctx) =>
  install('github-release', { repo: 'amir20/dtop' })
    .bin('dtop')
);
