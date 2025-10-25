---
description: Tool-agnostic development practices for LLM assistance.
applyTo: '**/*'
---
# Universal Tooling Practices

## Tool Usage Principles

- Never filter tooling output with grep, awk, sed, or similar content-filtering tools. Only use `head` or `tail` to limit output length. To find specific content, output the full result (or use head/tail to limit length) and search within the displayed output.
- Use the most appropriate tool available in the environment for each task
- Prefer tools that provide clear, parseable output for automation
- Choose tools that maintain data integrity and provide error handling
- Don't use `cat << EOF` style commands to make file changes

## Available Tooling

- `rg` is available to be used to search for files and text
- Use all available tools in the environment to accomplish tasks efficiently
- Use similar batch command to read multiple files at the same time:
  ```
  rg --files {dir} -g '*.ts' -g '*.tsx' | while read -r file; do \
    echo ""; \
    echo "=== $(basename "$file") ==="; \
    echo ""; \
    cat "$file"; \
    echo ""; \
  done
  ```

## Documentation and References

- Use context7 tool calling to retrieve up-to-date documentation for general tooling when needed
- Verify tool capabilities and syntax from authoritative sources before providing guidance
