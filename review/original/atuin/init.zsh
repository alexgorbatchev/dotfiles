#
# Atuin replaces your existing shell history with a SQLite database, and
# records additional context for your commands. With this context, Atuin gives
# you faster and better search of your shell history.
#
# https://docs.atuin.sh/
#

export ATUIN_CONFIG_DIR="$DOTFILES_CONFIGS/atuin"

zinit ice as=program from=gh-r \
  bpick="atuin-*.tar.gz" \
  mv="atuin*/atuin -> atuin" \
  atclone="./atuin init zsh > init.zsh; ./atuin gen-completions --shell zsh > _atuin" \
  atpull="%atclone=" \
  src="init.zsh"

zinit light atuinsh/atuin
