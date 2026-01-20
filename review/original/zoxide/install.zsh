function install--zoxide() {
  local reset="$1"
  local init_file="$DOTFILES_CONFIGS/zoxide/zoxide-init"

  zinit ice from=gh-r as=program
  zinit light ajeetdsouza/zoxide

  if [ ! -f "$init_file" ] || [ -n "$reset" ]; then
    zoxide init zsh >"$init_file"

    # Modify zoxide-init to fix the command so that it doesn't ignore `zoxide` alias
    if is-osx; then
      sed -i '' 's/\\command zoxide/zoxide/' "$init_file"
    else
      # same for linux
      sed -i 's/\\command zoxide/zoxide/' "$init_file"
    fi
  fi

  source "$init_file"
}
