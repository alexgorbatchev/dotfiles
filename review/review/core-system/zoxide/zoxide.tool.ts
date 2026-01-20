import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'ajeetdsouza/zoxide',
  })
    .bin('zoxide')
    .hook('after-install', async ({ $ }) => {
      const initFile = `${ctx.toolDir}/zoxide-init`;

      // Generate zoxide init file
      await $`zoxide init zsh > ${initFile}`;

      // Modify zoxide-init to fix the command so that it doesn't ignore `zoxide` alias
      // if (systemInfo?.platform === 'darwin') {
      //   await $`sed -i '' 's/\\\\command zoxide/zoxide/' ${initFile}`;
      // } else {
      //   await $`sed -i 's/\\\\command zoxide/zoxide/' ${initFile}`;
      // }
    })
    .zsh((shell) =>
      shell
        //
        .source(`${ctx.toolDir}/zoxide-init`)
        .aliases({
          z: 'zoxide',
          ze: 'zoxide edit',
        })
    )
);
