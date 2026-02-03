---
description: Prohibition of legacy code and backward compatibility layers
applyTo: '**/*'
---

# No Legacy Code

## Anti-Legacy Code Directive

When implementing new architecture or APIs, NEVER add deprecated/legacy properties or backward compatibility layers. Instead:

1. Update ALL existing code to use the new structure immediately
2. Delete old properties/methods completely from type definitions
3. Migrate every test, config, and usage to the new API in the same session
4. Have exactly ONE way to accomplish each task - no alternatives

If compilation errors occur after architectural changes, fix them by updating the code to use the new API, not by adding deprecated properties or `as any` casts.

## Rationale

Legacy code creates:

- Two ways to do the same thing (confusion)
- Impossible maintenance burden
- No visibility into actual usage
- Technical debt that never gets cleaned up
- Inconsistent codebase

## Non-Negotiable

Leave the codebase in a state where there is exactly one clear, modern way to accomplish each task. Migration work is mandatory, not optional.
