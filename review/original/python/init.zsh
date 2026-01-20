#
# https://github.com/pyenv/pyenv
#
export PYENV_VIRTUALENV_DISABLE_PROMPT=true
export PIP_REQUIRE_VIRTUALENV=true
export PYENV_ROOT="$HOME/.pyenv"

add-to-path "$PYENV_ROOT/bin"

#
# Setup async python loading to speed up shell startup
#
alias python="__dotfiles--python-async python"
alias pyenv="__dotfiles--python-async pyenv"
alias poetry="__dotfiles--python-async poetry"

# Alias to activate the virtual environment with UI
alias pea="navi --query='pyenv act virt env' --best-match"

# Automatically activate pyenv when `.python-version` file is present
function __dotfiles--pyenv-activate() {
  [ -f ".python-version" ] && (
    __dotfiles--python-async
    pyenv activate
  )
}

add-zsh-hook chpwd __dotfiles--pyenv-activate

function __dotfiles--python-async() {
  local target="$@"

  unalias python
  unalias pyenv
  unalias poetry
  unset -f __dotfiles--python-async

  if ! in-path "python"; then
    install--python
  fi

  add-to-path "$PYENV_ROOT/bin"

  eval "$(pyenv init --path)"
  eval "$(pyenv init -)"
  eval "$(pyenv virtualenv-init -)"
  eval "$target"
}
