#!/bin/sh
echo "Installing version-detection--default-args..."
mkdir -p "$INSTALL_DIR"
cat > "$INSTALL_DIR/version-detection--default-args" << 'EOF'
#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "version-detection--default-args 1.38.1"
else
  echo "version-detection--default-args: missing argument"
fi
EOF
chmod +x "$INSTALL_DIR/version-detection--default-args"
echo "version-detection--default-args installed"
