#!/usr/bin/env bash
# install-tool.sh
# Script to handle tool installation based on the tool's configuration

set -e

# Parse arguments
TOOL_NAME="$1"
if [ -z "$TOOL_NAME" ]; then
  echo "Error: Tool name is required"
  echo "Usage: $0 <tool-name>"
  exit 1
fi

# The main CLI command will be passed as the second argument
# This allows the script to be called from anywhere while still using the correct CLI tool
CLI_COMMAND="$2"
if [ -z "$CLI_COMMAND" ]; then
  CLI_COMMAND="mydotfiles" # Default if not provided
fi

echo "Installing tool: $TOOL_NAME using $CLI_COMMAND..."

# Execute the installation command
"$CLI_COMMAND" install "$TOOL_NAME"

# Check the exit status
if [ $? -ne 0 ]; then
  echo "Failed to install $TOOL_NAME"
  exit 1
fi

echo "Installation of $TOOL_NAME completed successfully"
exit 0
