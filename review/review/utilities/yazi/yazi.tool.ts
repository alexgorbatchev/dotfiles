import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'sxyazi/yazi',
    assetPattern: 'yazi-*.zip',
  })
    .bin('yazi', 'yazi-*/yazi')
    .bin('ya', 'yazi-*/ya')
    .zsh((shell) =>
      shell
        .environment({
          YAZI_CONFIG_HOME: `${ctx.toolDir}/config`,
        })
        .functions({
          // Will CD into the last directory you were in when yazi exits
          y: /* zsh */ `
            local tmp="$(mktemp -t "yazi-cwd.XXXXXX")"
            yazi --cwd-file="$tmp"
            if cwd="$(cat -- "$tmp")" && [ -d "$cwd" ]; then
              cd "$cwd"
            fi
            rm -f -- "$tmp"
          `,
        })
    )
);
