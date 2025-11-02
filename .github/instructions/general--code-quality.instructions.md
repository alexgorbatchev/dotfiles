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
- Add comments for complex business logic or non-obvious decisions. When logic is ported or inspired by an external source, retain comments that map the implementation back to the original source's specific sections or reasoning, even if a general link is provided. This context is critical for future maintenance and debugging. For example, if a shell script loop is ported to TypeScript, the original shell code should be kept in a comment block next to the new implementation for direct comparison.  
- Remove dead code rather than commenting it out
- Use meaningful variable and function names that express intent

## Function Design

- Design functions with clear inputs and predictable outputs
- Separate core logic from external dependencies and side effects
- Make dependencies explicit through parameters rather than implicit through globals
- Structure code to be testable and maintainable

## Return Value Standards

- **Explicit Return Types**: All functions must declare explicit return types
- **No Inline Object Returns**: Functions must never return `{...}` object literals directly
- **Typed Variable Pattern**: Declare result with explicit type, then return the typed variable

```typescript
// ❌ BAD - Inline object return
function createUser(name: string) {
  return {
    id: generateId(),
    name,
    createdAt: new Date()
  };
}

// ✅ GOOD - Explicit return type and typed variable
function createUser(name: string): UserResult {
  const result: UserResult = {
    id: generateId(),
    name,
    createdAt: new Date()
  };
  return result;
}
```

**Rationale**: Explicit return types and typed variables improve:
- Type safety and compile-time error detection
- Code readability and documentation
- Refactoring safety and IDE support
- Debugging experience with clear variable names

## Consistency

- Follow established patterns and conventions within the codebase
- Maintain consistent formatting and style
- Apply the same level of rigor to all parts of the codebase
- Document deviations from standard patterns when necessary

## Universal Enforcement Policy

**When working with existing code that violates ANY of these standards, ALL violations in the file must be corrected during any modification session.** This applies to:

- Return value standards (explicit types, no inline objects)
- Production code purity (no test-only code)
- Variable naming conventions
- Function design principles
- Import statement formatting
- Type safety rules
- All other code quality standards

**Rationale**: Maintaining mixed patterns within files creates:
- Inconsistent codebase that's harder to understand
- Technical debt accumulation
- Confusion about which patterns to follow
- Reduced code maintainability

**Non-negotiable**: Do not leave files in a state where some code follows standards while other code violates them. Complete compliance within each modified file is mandatory.

## Comments and Code Maintenance

- The project uses GIT to track changes and change comments are not necessary.
- Do not comment out code, remove it instead.
- Use meaningful comments for complex business logic.
- All comments must reflect the current state of the code only and never refer to previous versions or changes.

## PRODUCTION CODE PURITY

Production code must NEVER include code solely for testing purposes. This includes:

- Test-only conditional branches or flags
- Debug-only code paths that serve no production purpose
- Testing utilities or helpers embedded in production modules
- Mock implementations or test doubles in production code
- Special handling for test environments within business logic
- Throwing "Not Implemented" errors or placeholder implementations
- TODO comments indicating incomplete functionality
- Stub methods that exist only to satisfy interfaces during development

RATIONALE:

Test-specific code in production:
- Creates security vulnerabilities through undocumented code paths
- Increases complexity and maintenance burden
- Reduces confidence in production behavior
- Makes code harder to reason about and debug
- Violates the single responsibility principle
- Can cause runtime failures in production environments

NON-NEGOTIABLE: All testing needs must be satisfied through proper dependency injection, test doubles, or separate test utilities. Production code must be focused solely on its intended business purpose and must be fully implemented before deployment.

### Stub Implementation Policy

When replacing production code:
- NEVER commit stub/placeholder implementations to production code paths
- If implementation is incomplete, either:
  1. Complete the implementation before integration, OR
  2. Keep both old and new implementations until new is complete
- "Replace X with Y" means Y must be functionally complete and all tests must pass
- Incomplete implementations must not be integrated into production code paths

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
