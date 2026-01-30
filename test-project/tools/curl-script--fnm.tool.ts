/* oxlint-disable no-console */
import { defineTool } from '@dotfiles/cli';

export default defineTool((install, ctx) => {
  const initFile = `${ctx.currentDir}/fnm-init.zsh`;

  return install('curl-script', {
    url: 'https://fnm.vercel.app/install',
    shell: 'bash',
    args: (ctx) => ['--skip-shell', '--install-dir', ctx.stagingDir, '--force-no-brew'],
  })
    .bin('fnm')
    .hook('after-install', async ({ $ }) => {
      await $`fnm env --use-on-cd > ${initFile}`;
    })
    .zsh((shell) =>
      shell
        .completions({ cmd: 'fnm completions --shell zsh', bin: 'fnm' })
        .source(initFile)
        .source('/path/that/does/not/exist')
    );
});
