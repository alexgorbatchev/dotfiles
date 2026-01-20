import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, _ctx) =>
  install('manual', {
    binaryPath: 'cargo',
  })
    .bin('cargo')
    .hook('before-install', async ({ $ }) => {
      // Install Rust toolchain via rustup
      await $`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- --no-modify-path -y -q`;
    })
    .zsh((shell) =>
      shell.always(/* zsh */ `
        # Add cargo bin to PATH
        export PATH="~/.cargo/bin:$PATH"
      `)
    )
);
