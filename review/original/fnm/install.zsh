function install--fnm() {
  local reset="$1"

  if ! is-command fnm || [ -n "$reset" ]; then
    curl -fsSL https://fnm.vercel.app/install | bash -s -- --skip-shell --install-dir "$LOCAL_BIN"
    echo "$(fnm completions --shell zsh)" >"$ZINIT_HOME/../completions/_fnm"
  fi
}
