function install--navi() {
  local reset="$1"
  local init_file="$DOTFILES_CONFIGS/navi/navi-init"

  zinit ice lucid from=gh-r as=program
  zinit load denisidoro/navi

  if [ ! -f "$init_file" ] || [ -n "$reset" ]; then
    navi widget zsh >"$init_file"

    # Modify key binding from Ctrl-G to Ctrl-\
    if is-osx; then
      sed -i '' "s/bindkey '^g'/bindkey '^\\\\'/" "$init_file"
    else
      # same for linux
      sed -i "s/bindkey '^g'/bindkey '^\\\\'/" "$init_file"
    fi
  fi

  source "$init_file"
}
