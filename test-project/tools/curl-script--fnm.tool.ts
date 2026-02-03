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
        .sourceFile(initFile)
        .sourceFile('/path/that/does/not/exist')
        // Using shell.source() for inline content
        .source('echo "export FOO=bar"')
        .functions({
          'fnm-func': /* zsh */ `
            echo "/foo/bar"
          `,
        })
        .sourceFunction('fnm-func')
    );
});
