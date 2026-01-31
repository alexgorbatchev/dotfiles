#!/bin/bash
set -e

INSTALL_DIR="${INSTALL_DIR:-./bin}"
mkdir -p "$INSTALL_DIR"

cat > "$INSTALL_DIR/version-detection--curl-script--with-args" << 'EOF'
#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "version-detection--curl-script--with-args 2.3.4"
else
  echo "Hello from version-detection--curl-script--with-args"
fi
EOF

chmod +x "$INSTALL_DIR/version-detection--curl-script--with-args"
