---
description: Tool-agnostic development practices for LLM assistance.
applyTo: '**/*'
---
# Universal Tooling Practices

## Tool Usage Principles

- DO NOT use ` << EOF` when running CLI commands, no exceptions!
- DO NOT change multiple files via CLI commands, no exceptions!

## Available CLI Tooling

- Use all additional available tools in the environment to accomplish tasks efficiently: rg, jq
- To read multiple files at the same time use this kind of batch command:
  ```shell
  rg --files {dir} -g '*.ts' -g '*.tsx' | while read -r file; do \
    echo ""; \
    echo "=== $(basename "$file") ==="; \
    echo ""; \
    cat "$file"; \
    echo ""; \
  done
  ```

## Documentation and References

- Use context7 tool calling to retrieve up-to-date documentation for general tooling when needed.
- Always verify tool capabilities and syntax from authoritative sources before providing guidance.
