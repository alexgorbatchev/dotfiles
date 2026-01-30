import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) => {
  return install('github-release', {
    repo: 'JanDeDobbeleer/oh-my-posh',
  })
    .bin('oh-my-posh', 'posh-*')
    .hook('after-install', async ({ $ }) => {
      // Generate init files for different configs
      const configs = ['default', 'minimal'];

      for (const configKind of configs) {
        const configFile = `${ctx.toolDir}/config/${configKind}.yaml`;
        const initFile = `${ctx.currentDir}/oh-my-posh-init-${configKind}`;

        await $`oh-my-posh init zsh --config ${configFile} --print > ${initFile}`;
      }
    })
    .zsh((shell) =>
      shell
        .sourceFunction('oh-my-posh-select-config')
        .functions({
          'oh-my-posh-select-config': /* zsh */ `
            local config_kind
            local config_file
            local init_file

            if [ -n "$MYVIMRC" ] || [ "$TERM_PROGRAM" = "vscode" ]; then
              config_kind="minimal"
            else
              config_kind="default"
            fi

            config_file="${ctx.toolDir}/config/$config_kind.yaml"
            init_file="${ctx.currentDir}/oh-my-posh-init-$config_kind"

            echo "$init_file"
          `,
        })
    );
});
