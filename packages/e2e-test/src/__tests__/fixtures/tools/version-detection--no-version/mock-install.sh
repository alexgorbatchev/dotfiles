#!/bin/sh
echo "Installing version-detection--no-version..."
mkdir -p "$INSTALL_DIR"
cat > "$INSTALL_DIR/version-detection--no-version" << 'EOF'
#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "Some tool with no version info"
else
  echo "Hello from version-detection--no-version"
fi
EOF
chmod +x "$INSTALL_DIR/version-detection--no-version"
echo "version-detection--no-version installed"
