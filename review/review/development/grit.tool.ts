import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, _ctx) =>
  install('github-release', {
    repo: 'getgrit/gritql',
  })
    .bin('grit', 'grit')
    .zsh((shell) =>
      shell.env({
        GRIT_TELEMETRY_DISABLED: 'true',
      })
    )
);
