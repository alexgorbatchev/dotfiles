import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, _ctx) =>
  install('github-release', {
    repo: 'oven-sh/bun',
    // pick the asset that does not have "-profile" in its name
    assetPattern: /^(?!.*-profile).*\.zip$/,
  })
    .bin('bun')
    .zsh((shell) =>
      shell
        .completions((ctx) => ({
          url: `https://raw.githubusercontent.com/oven-sh/bun/refs/tags/${ctx.version}/completions/bun.zsh`,
        }))
        .aliases({
          br: 'bun run',
          brw: 'bun run --watch',
          bt: 'bun test',
          btw: 'bun test --watch',
        })
        .functions({
          'fzf-typescript': /* zsh */ `
          local opts
          opts=$(printf -- "-name '%s' -o " "$@" | sed 's/ -o $//')
          eval "find . -type f \\( $opts \\) -not -path '*/node_modules/*'" | fzf --multi --preview 'cat {}' --preview-window='right:60%:wrap'
        `,
          brf: /* zsh */ `
          local file
          file=$(fzf-typescript '*.ts' '*.tsx')
          [ -n "$file" ] && br "$file"
        `,
          brwf: /* zsh */ `
          local file
          file=$(fzf-typescript '*.ts' '*.tsx')
          [ -n "$file" ] && brw "$file"
        `,
          btf: /* zsh */ `
          local file
          file=$(fzf-typescript '*.test.ts' '*.test.tsx')
          [ -n "$file" ] && btw "$file"
        `,
          btwf: /* zsh */ `
          local file
          file=$(fzf-typescript '*.test.ts' '*.test.tsx')
          [ -n "$file" ] && btw "$file"
        `,
        })
    )
);
