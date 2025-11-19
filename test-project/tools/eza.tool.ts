import { defineTool, Platform } from '../../packages/cli';

export default defineTool((install, _ctx) =>
  install()
    .bin('eza')
    .dependsOn('rg')
    .platform(Platform.MacOS, (install) =>
      install('cargo', {
        crateName: 'eza',
        binarySource: 'cargo-quickinstall',
        githubRepo: 'eza-community/eza',
      })
    )
    .platform(Platform.Linux, (install) =>
      install('github-release', {
        repo: 'eza-community/eza',
      }).zsh({
        completions: {
          source: 'completions/zsh/_eza',
        },
      })
    )
    .zsh({
      aliases: {
        el: 'eza --all --long --header --icons --group-directories-first',
        ll: 'el',
        l: 'el',
      },
    })
);
