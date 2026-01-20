import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'JanDeDobbeleer/oh-my-posh',
  })
    .bin('oh-my-posh', 'posh-*')
    .hook('after-install', async ({ $ }) => {
      // Generate init files for different configs
      const configs = ['default', 'minimal'];

      for (const configKind of configs) {
        const configFile = `${ctx.toolDir}/config/${configKind}.yaml`;
        const initFile = `${ctx.toolDir}/oh-my-posh-init-${configKind}`;

        await $`oh-my-posh init zsh --config ${configFile} > ${initFile}`;
      }
    })
    .zsh((shell) =>
      shell.always(/* zsh */ `
        local config_kind
        local config_file
        local init_file
        local dir="${ctx.toolDir}"

        if [ -n "$MYVIMRC" ] || [ "$TERM_PROGRAM" = "vscode" ]; then
          config_kind="minimal"
        else
          config_kind="default"
        fi

        config_file="$dir/config/$config_kind.yaml"
        init_file="$dir/oh-my-posh-init-$config_kind"

        if [ -f "$init_file" ]; then
          source "$init_file"
        fi
      `)
    )
);
