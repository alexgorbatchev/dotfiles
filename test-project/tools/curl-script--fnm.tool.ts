/* oxlint-disable no-console */
import { defineTool, Platform } from '@dotfiles/cli';

export default defineTool((install, _ctx) =>
  install('curl-script', {
    url: 'https://fnm.vercel.app/install',
    shell: 'bash',
    args: (ctx) => ['--skip-shell', '--install-dir', ctx.stagingDir, '--force-no-brew'],
    env: (ctx) => ({ INSTALL_DIR: ctx.stagingDir }),
  })
    .hook('after-install', async (ctx) => {
      if (ctx.systemInfo.platform === Platform.MacOS) {
        console.log(`fnm installed to ${ctx.currentDir}`);
      }
    })
    .bin('fnm')
    .zsh((shell) =>
      shell
        .completions({ cmd: 'fnm completions --shell zsh', bin: 'fnm' })
        .source('/path/that/does/not/exist')
        .always(/* zsh */ `
          # Initialize fnm with auto-use on cd
          eval "$(fnm env --use-on-cd)"
        `)
    )
);
