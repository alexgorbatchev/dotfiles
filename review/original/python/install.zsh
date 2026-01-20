function install--python() {
  # prompt user to install Python stack
  gum confirm "Need to install Python stack (pyenv, python, poetry, uv). This may take some time, continue?"

  # if confirmed...
  if [ $? -eq 0 ]; then
    install--python--pyenv
    install--python--poetry
    install--python--python
    install--python--uv
  fi
}

function install--python--uv() {
  if ! is-command uv; then
    echo "Installing uv"
    curl -LsSf https://astral.sh/uv/install.sh | sh
  fi
}

function install--python--pyenv() {
  if ! is-command pyenv; then
    echo "Installing pyenv"
    curl https://pyenv.run | bash
  fi
}

function install--python--poetry() {
  if ! is-command poetry; then
    echo "Installing poetry"
    curl -sSL https://install.python-poetry.org | python3 -
  fi
}

function install--python--python() {
  # Fetch the latest stable Python version (excluding alpha and beta builds)
  local latest_python_version=$(
    pyenv install --list | grep -v - | grep -vE '[ab]' | tail -1 | tr -d '[:space:]'
  )

  echo "Installing python v$latest_python_version"

  require-dependencies \
    curl \
    libbz2-dev \
    libffi-dev \
    liblzma-dev \
    libncurses5-dev \
    libncursesw5-dev \
    libreadline-dev \
    libsqlite3-dev \
    libssl-dev \
    llvm \
    tk-dev \
    wget \
    xz-utils \
    zlib1g-dev \
    python3-openssl

  # Install the latest version
  pyenv install $latest_python_version

  # Set the latest version as the global default
  pyenv global $latest_python_version

  # This rebuilds the shim executables
  pyenv rehash
}
