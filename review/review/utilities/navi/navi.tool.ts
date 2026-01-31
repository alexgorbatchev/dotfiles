import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) => {
  const initFile = `${ctx.currentDir}/navi-init`;

  return install('github-release', {
    repo: 'denisidoro/navi',
    version: '2.23.0',
  })
    .bin('navi')
    .symlink('config.yaml', '~/.config/navi/config.yaml')
    .hook('after-install', async ({ $ }) => {
      // Generate navi widget
      await $`navi widget zsh > ${initFile}`;

      // Modify key binding from Ctrl-\ to Ctrl-G
      await ctx.replaceInFile(initFile, /bindkey '\^\\' navi-widget/, `bindkey '^g' navi-widget`, {
        errorMessage: 'Failed to replace keybinding in navi init file',
      });
    })
    .zsh((shell) =>
      shell
        .environment({
          NAVI_CONFIG: `${ctx.toolDir}/config.yaml`,
        })
        .always(/* zsh */ `
          # Need to eval the widget to get the keybindings working with jeffreytse/zsh-vi-mode
          [ -f "${initFile}" ] && zvm_after_init_commands+=("source '${initFile}'")
        `)
    );
});
