import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, _ctx) =>
  install('curl-script', {
    url: 'https://fly.io/install.sh',
    shell: 'sh',
  })
    .bin('fly')
    .zsh((shell) =>
      shell
        .env({
          FLYCTL_INSTALL: '$HOME/.fly',
        })
        .always(/* zsh */ `
          # Add fly to PATH
          export PATH="$FLYCTL_INSTALL/bin:$PATH"
        `)
    )
);
