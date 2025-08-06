---
root: false
targets: ["*"]
description: Universal code quality standards for LLM assistance.
globs:
  - '**/*'
---

# Universal Code Quality Standards

## File Organization

- Keep files focused on a single responsibility or concept
- Break large files into smaller, manageable pieces
- Use consistent file naming patterns within the project
- Group related functionality together

## Code Clarity

- Write self-documenting code with clear naming
- Add comments for complex business logic or non-obvious decisions  
- Remove dead code rather than commenting it out
- Use meaningful variable and function names that express intent

## Function Design

- Design functions with clear inputs and predictable outputs
- Separate core logic from external dependencies and side effects
- Make dependencies explicit through parameters rather than implicit through globals
- Structure code to be testable and maintainable

## Consistency

- Follow established patterns and conventions within the codebase
- Maintain consistent formatting and style
- Apply the same level of rigor to all parts of the codebase
- Document deviations from standard patterns when necessary
