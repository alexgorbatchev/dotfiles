---
root: false
targets: ["*"]
description: 'Universal development rules for LLM assistance'
globs:
  - '**/*'
---

# Universal Development Rules

## Communication Style

- Be direct, technical, and precise in responses
- Challenge assumptions and ask clarifying questions when requirements are unclear
- Focus on problem-solving rather than agreement
- Provide factual, actionable guidance

## Code Quality Principles

- Write code that is self-documenting and maintainable
- Follow consistent patterns within the codebase
- Implement single responsibility principle for functions and modules
- Use meaningful names that express intent

## Development Approach

- Understand existing code patterns before making changes
- Validate that dependencies exist before using them
- Write tests to verify functionality works as expected
- Run validation tools to ensure code quality

## Problem-Solving Process

- Read and understand existing code structure
- Identify the root cause of issues before implementing fixes
- Consider edge cases and error conditions
- Verify solutions work in the target environment

## Troubleshooting

- **CLI commands not working**: Check which directory the current terminal session is in
