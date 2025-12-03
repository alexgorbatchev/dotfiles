import { defineTool, Platform } from '../../packages/cli';

export default defineTool((install, _ctx) =>
  install()
    .platform(Platform.MacOS, (install) => install('cargo', { crateName: 'eza' }))
    .platform(Platform.Linux, (install) => install('github-release', { repo: 'eza-community/eza' }))
    .zsh((shell) =>
      shell
        .aliases({
          el: 'eza --all --long --header --icons --group-directories-first',
          ll: 'el',
          l: 'el',
        })
        .completions('completions/zsh/_eza')
    )
);
