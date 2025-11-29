import { defineTool } from '../../../packages/cli';

export default defineTool((install, ctx) =>
  install('curl-script', {
    url: 'https://fnm.vercel.app/install',
    shell: 'bash',
    args: ctx => ['--skip-shell', '--install-dir', ctx.installDir],
  })
    .bin('fnm')
    .hook('after-install', async ({ $,  }) => {
      // Generate completions
      await $`fnm completions --shell zsh > ${ctx.toolDir}/_fnm`;
    })
    .zsh((shell) =>
      shell.completions('_fnm').always(/* zsh */ `
          # Initialize fnm with auto-use on cd
          eval "$(fnm env --use-on-cd)"
        `)
    )
);
