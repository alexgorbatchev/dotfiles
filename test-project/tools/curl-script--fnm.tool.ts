import { defineTool } from '@dotfiles/cli';

export default defineTool((install) =>
  install('curl-script', {
    url: 'https://fnm.vercel.app/install',
    shell: 'bash',
    args: (ctx) => ['--skip-shell', '--install-dir', ctx.installDir, '--force-no-brew'],
  })
    .bin('fnm')
    .zsh((shell) =>
      shell
        //
        .completions({ cmd: 'fnm completions --shell zsh' })
        .always(/* zsh */ `
          # Initialize fnm with auto-use on cd
          eval "$(fnm env --use-on-cd)"
        `)
    )
);
