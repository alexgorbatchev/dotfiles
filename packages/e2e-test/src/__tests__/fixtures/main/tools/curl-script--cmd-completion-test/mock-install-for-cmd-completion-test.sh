#!/usr/bin/env bash
# Mock installation script for completion generation test

set -e

# Use INSTALL_DIR env var if set, otherwise use current directory
: "${INSTALL_DIR:=$(pwd)}"

# Create the binary in the install directory
cat > "$INSTALL_DIR/curl-script--cmd-completion-test" << 'EOF'
#!/usr/bin/env bash
# Mock binary for curl-script--cmd-completion-test

case "$1" in
  completions)
    case "$2" in
      zsh)
        echo "#compdef curl-script--cmd-completion-test"
        echo ""
        echo "_curl-script--cmd-completion-test() {"
        echo "  _arguments '1: :(completions help version)'"
        echo "}"
        echo ""
        echo "_curl-script--cmd-completion-test"
        ;;
      bash)
        echo "_curl_script_cmd_completion_test() {"
        echo "  local cur prev opts"
        echo "  cur=\"\${COMP_WORDS[COMP_CWORD]}\""
        echo "  opts=\"completions help version\""
        echo "  COMPREPLY=( \$(compgen -W \"\${opts}\" -- \${cur}) )"
        echo "}"
        echo ""
        echo "complete -F _curl_script_cmd_completion_test curl-script--cmd-completion-test"
        ;;
      *)
        echo "Unknown shell: $2" >&2
        exit 1
        ;;
    esac
    ;;
  --version)
    echo "1.0.0"
    ;;
  *)
    echo "Mock curl-script--cmd-completion-test"
    echo "Commands: completions, help, version"
    ;;
esac
EOF

chmod +x "$INSTALL_DIR/curl-script--cmd-completion-test"

echo "Successfully installed curl-script--cmd-completion-test to $INSTALL_DIR"
