import { defineTool, Platform } from '@gitea/dotfiles';

export default defineTool((install, _ctx) =>
  install()
    .bin('eza')
    .platform(Platform.MacOS, (install) =>
      install('cargo', {
        crateName: 'eza',
        binarySource: 'cargo-quickinstall',
        githubRepo: 'eza-community/eza',
      })
    )
    .platform(Platform.Linux, (install) =>
      install('github-release', { repo: 'eza-community/eza' })
        //
        .zsh((shell) => shell.completions('completions/zsh/_eza'))
    )
    .zsh((shell) =>
      shell.aliases({
        el: 'eza --all --long --header --icons --group-directories-first',
        ll: 'el',
        l: 'el',
      })
    )
);
