---
description: Universal code quality standards for LLM assistance.
applyTo: '**/*'
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

## Comments and Code Maintenance

- The project uses GIT to track changes and change comments are not necessary.
- Do not comment out code, remove it instead.
- Use meaningful comments for complex business logic.
- All comments must reflect the current state of the code only and never refer to previous versions or changes.

## ANTI-LEGACY CODE DIRECTIVE

When implementing new architecture or APIs, NEVER add deprecated/legacy properties or backward compatibility layers. Instead:

1. Update ALL existing code to use the new structure immediately
2. Delete old properties/methods completely from type definitions
3. Migrate every test, config, and usage to the new API in the same session
4. Have exactly ONE way to accomplish each task - no alternatives

If compilation errors occur after architectural changes, fix them by updating the code to use the new API, not by adding deprecated properties or as any casts.

RATIONALE:

Legacy code creates:
- Two ways to do the same thing (confusion)
- Impossible maintenance burden
- No visibility into actual usage
- Technical debt that never gets cleaned up
- Inconsistent codebase

NON-NEGOTIABLE: Leave the codebase in a state where there is exactly one clear, modern way to accomplish each task. Migration work is mandatory, not optional.
