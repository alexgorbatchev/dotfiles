function install--fly() {
  if ! is-runnable fly; then
    curl -L https://fly.io/install.sh | sh
  fi
}
