import { describe, it, expect } from 'bun:test';
import fs from 'node:fs/promises';
import path from 'node:path';

// A simple template rendering function for testing purposes
async function renderShimTemplate(
  templatePath: string,
  toolName: string,
  binaryName: string
): Promise<string> {
  const templateContent = await fs.readFile(templatePath, 'utf-8');
  return templateContent
    .replace(/\{\{TOOL_NAME\}\}/g, toolName)
    .replace(/\{\{BINARY_NAME\}\}/g, binaryName);
}

describe('Bash Shim Template', () => {
  const templatePath = path.resolve(__dirname, '../shim.sh');
  const testToolName = 'my-cli-tool';
  const testBinaryName = 'my-cli';

  it('should render the template with TOOL_NAME and BINARY_NAME placeholders', async () => {
    const renderedScript = await renderShimTemplate(templatePath, testToolName, testBinaryName);

    expect(renderedScript).toContain(`TOOL_NAME="${testToolName}"`);
    expect(renderedScript).toContain(`BINARY_NAME="${testBinaryName}"`);
    expect(renderedScript).toContain(`# Shim for ${testToolName}`);
    expect(renderedScript).toContain('TOOL_INSTALL_DIR="$INSTALL_DIR_BASE/$TOOL_NAME"');
    expect(renderedScript).toContain('EXPECTED_BINARY_PATH="$TOOL_INSTALL_DIR/bin/$BINARY_NAME"');
    // The log_message function itself uses $TOOL_NAME, so we check for the echo line content
    expect(renderedScript).toContain('echo "Shim ($TOOL_NAME): $1"');
    // The installation script call also uses shell variables $TOOL_NAME and $BINARY_NAME
    expect(renderedScript).toContain('"$INSTALL_SCRIPT_PATH" "$TOOL_NAME" "$BINARY_NAME"');
    expect(renderedScript).toContain('exec "$EXPECTED_BINARY_PATH" "$@"');
  });

  it('should have the correct shebang', async () => {
    const renderedScript = await renderShimTemplate(templatePath, testToolName, testBinaryName);
    expect(renderedScript.startsWith('#!/bin/bash')).toBe(true);
  });

  it('should define key variables', async () => {
    const renderedScript = await renderShimTemplate(templatePath, testToolName, testBinaryName);
    expect(renderedScript).toMatch(/INSTALL_DIR_BASE="\$HOME\/\.dotfiles\/\.generated\/binaries"/);
    expect(renderedScript).toMatch(/INSTALL_SCRIPT_PATH="\$HOME\/\.dotfiles\/install-tool\.sh"/);
  });

  it('should include the log_message function', async () => {
    const renderedScript = await renderShimTemplate(templatePath, testToolName, testBinaryName);
    expect(renderedScript).toContain('log_message() {');
    expect(renderedScript).toContain('echo "Shim ($TOOL_NAME): $1"');
  });

  it('should include the binary existence check', async () => {
    const renderedScript = await renderShimTemplate(templatePath, testToolName, testBinaryName);
    expect(renderedScript).toContain('if [ ! -x "$EXPECTED_BINARY_PATH" ]');
  });

  it('should include the call to the installation script', async () => {
    const renderedScript = await renderShimTemplate(templatePath, testToolName, testBinaryName);
    expect(renderedScript).toContain('if [ -f "$INSTALL_SCRIPT_PATH" ]');
    expect(renderedScript).toContain('chmod +x "$INSTALL_SCRIPT_PATH"');
    expect(renderedScript).toContain('if "$INSTALL_SCRIPT_PATH" "$TOOL_NAME" "$BINARY_NAME"; then');
  });

  it('should include the final exec call', async () => {
    const renderedScript = await renderShimTemplate(templatePath, testToolName, testBinaryName);
    expect(renderedScript).toContain('exec "$EXPECTED_BINARY_PATH" "$@"');
  });
});
