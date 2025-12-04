#!/bin/sh
echo "Installing version-detection--curl-script--default-args..."
mkdir -p "$INSTALL_DIR"
cat > "$INSTALL_DIR/version-detection--curl-script--default-args" << 'EOF'
#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "version-detection--curl-script--default-args 1.38.1"
else
  echo "version-detection--curl-script--default-args: missing argument"
fi
EOF
chmod +x "$INSTALL_DIR/version-detection--curl-script--default-args"
echo "version-detection--curl-script--default-args installed"
