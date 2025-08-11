---
root: false
targets: ["*"]
description: Tool-agnostic development practices for LLM assistance.
globs:
  - '**/*'
---

# Universal Tooling Practices

## Tool Usage Principles

- Use the most appropriate tool available in the environment for each task
- Prefer tools that provide clear, parseable output for automation
- Choose tools that maintain data integrity and provide error handling

## File Modification Guidelines

- Use dedicated text processing tools rather than general-purpose stream editors
- Never use schell commands to modify files, all changes have to be done manually
- Verify file changes before committing modifications
- Prefer tools with built-in backup or safety mechanisms
- Test modifications in isolated environments first

## Search and Analysis

- `rg` must be used to search for files and text
- Use efficient search tools that can handle large codebases
- Prefer tools that support regex and contextual search patterns
- Choose tools that provide structured output for further processing

## Documentation and References

- Use context7 tool calling to retrieve up-to-date documentation for general tooling when needed
- Verify tool capabilities and syntax from authoritative sources before providing guidance
