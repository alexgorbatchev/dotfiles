#!/usr/bin/env bash
# Mock install script for cmd-based completion tests

# Determine install directory
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"
mkdir -p "$INSTALL_DIR"

# Copy the mock binary to install directory
BINARY_PATH="$INSTALL_DIR/curl-script--cmd-completion-test"

# Create the mock binary inline
cat > "$BINARY_PATH" << 'BINARY_EOF'
#!/usr/bin/env bash

# Mock curl-script--cmd-completion-test that responds to completions command

if [ "$1" = "completions" ]; then
  if [ "$2" = "zsh" ]; then
    cat << 'EOF'
#compdef curl-script--cmd-completion-test

_curl-script--cmd-completion-test() {
  local -a commands
  commands=(
    'install:Install a tool'
    'completions:Generate completions'
  )
  _describe 'command' commands
}

_curl-script--cmd-completion-test "$@"
EOF
  elif [ "$2" = "bash" ]; then
    cat << 'EOF'
# bash completion for curl-script--cmd-completion-test

_curl_script_cmd_completion_test() {
  local cur="${COMP_WORDS[COMP_CWORD]}"
  COMPREPLY=($(compgen -W "install completions" -- "$cur"))
}

complete -F _curl_script_cmd_completion_test curl-script--cmd-completion-test
EOF
  fi
elif [ "$1" = "--version" ]; then
  echo "curl-script--cmd-completion-test 1.2.3"
else
  echo "curl-script--cmd-completion-test: Unknown command"
  exit 1
fi
BINARY_EOF

chmod +x "$BINARY_PATH"
echo "curl-script--cmd-completion-test installed to $BINARY_PATH"
