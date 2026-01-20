import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('curl-script', {
    url: 'https://fnm.vercel.app/install',
    shell: 'bash',
    args: (hookCtx) => ['--skip-shell', '--install-dir', hookCtx.stagingDir, '--force-no-brew'],
  })
    .bin('fnm')
    .hook('after-install', async ({ $ }) => {
      const targetPath = `${ctx.projectConfig.paths.binariesDir}/fnm/fnm-init.zsh`;
      await $`fnm env --use-on-cd > ${targetPath}`;
    })
    .zsh((shell) =>
      shell
        .completions({ cmd: 'fnm completions --shell zsh', bin: 'fnm' })
        .source('fnm-init.zsh')
    )
);
