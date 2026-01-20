import { defineTool } from '@gitea/dotfiles';

/**
 * glances - Cross-platform system monitoring tool with real-time CPU, memory,
 * disk, network usage and process monitoring. Supports web interface, client/server
 * mode, and exports to various databases.
 *
 * https://github.com/nicolargo/glances
 */
export default defineTool((install, _ctx) =>
  install('brew', { formula: 'glances' })
    .bin('glances')
    .zsh((shell) =>
      shell
        .completions({ cmd: 'glances --print-completion zsh' })
    )
);
