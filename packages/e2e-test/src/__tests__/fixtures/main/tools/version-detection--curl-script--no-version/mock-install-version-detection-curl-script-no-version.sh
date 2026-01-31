#!/bin/bash
# Mock install script that creates a binary without version output
mkdir -p "$INSTALL_DIR"

# Create a mock binary that outputs nothing useful for version detection
cat > "$INSTALL_DIR/version-detection--curl-script--no-version" << 'BINARY'
#!/bin/bash
case "$1" in
  --version|-v|-V|version)
    echo "Some tool with no version info"
    ;;
  *)
    echo "Hello from version-detection--curl-script--no-version"
    ;;
esac
BINARY

chmod +x "$INSTALL_DIR/version-detection--curl-script--no-version"
