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

- Never use schell commands to make text changes, all text edits must be done manually
- Verify file changes before committing modifications
- Test modifications in isolated environments first

## Available Tooling

- `rg` is available to be used to search for files and text
- Use all available tools in the environment to accomplish tasks efficiently

## Documentation and References

- Use context7 tool calling to retrieve up-to-date documentation for general tooling when needed
- Verify tool capabilities and syntax from authoritative sources before providing guidance
