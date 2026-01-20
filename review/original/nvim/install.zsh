function install--nvim() {
  zinit ice from=gh-r as=program \
    bpick="*.tar.gz" \
    pick="nvim-*/bin/nvim"

  zinit load neovim/neovim

  ln-once "$DOTFILES_CONFIGS/nvim/lazyvim" "$HOME/.config/nvim"

  unalias nvim
  export VIMRUNTIME="$(dirname $(which nvim))/../share/nvim/runtime"
}
