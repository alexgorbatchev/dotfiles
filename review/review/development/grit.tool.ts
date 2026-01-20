import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, _ctx) =>
  install('github-release', {
    repo: 'getgrit/gritql',
  })
    .bin('grit', 'grit')
    .zsh((shell) =>
      shell.environment({
        GRIT_TELEMETRY_DISABLED: 'true',
      })
    )
);
