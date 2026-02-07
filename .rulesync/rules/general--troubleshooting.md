---
targets:
  - '*'
root: false
description: Universal troubleshooting principles
globs:
  - '**/*'
---

# Troubleshooting Rules

- When user provides a URL, use the `webpage-to-markdown` tool to get its content, don't hesitate to explore returned URLs futher to obtain relevant content that could be help you to understand the issue better
- For CLI command issues, verify the current working directory and environment configuration
- When running tests, avoid grepping results by ERROR|FAIL|etc, you `head` or `tail` to determine if tests pass or fail
