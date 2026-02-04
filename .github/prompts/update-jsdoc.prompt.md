---
agent: agent
description: Refresh JSDoc in projecty.
---

Your job is to diligently update JSDoc to represent current implementation and functionality.

# Steps

## Initialization

0. If the user provided specific file to update, go to ## Update File section immediately and then stop, otherwise
1. Check if there is a `JSDOC-UPDATE.md` file in the workspace root folder
2. If it does not exist, go to ## Setup section
3. If it exists, read it and continue from the last unchecked package, go to ## Review section

## Setup

1. Use the `bun scripts/analyze-deps.ts` command to get the list of all packages in the project and their dependencies
2. Create a `JSDOC-UPDATE.md` file with a markdown checklist, the list should be nested to represent the dependency hierarchy, with each package indented under the packages it depends on, following the format below:

```markdown
- [ ] pkgA
- [ ] pkgB
- [ ] pkgC
  - pkgA
- [ ] pkgD
  - pkgC
  - pkgB
```

3. Go to ## Review section

## Review

1. Read `README.md` for previously completed packages
2. Go to ## Update section

## Update

### Update File

1. Read every .ts file in the package excluding the `__tests__` folder using the bulk command
2. Review every JSDoc comment for accuracy and completeness

### Update Package

1. Using the package source code and `README.md` files from other packages, update JSDoc to reflect current implementation and functionality
2. When updating a `README.md`, you must first read its contents. If the file contains development guidelines or architectural rules, you must preserve and integrate them into the updated documentation. However, any details related to legacy systems, migration strategies, or deprecated functionality must be removed. Do not replace prescriptive guidance with a simple summary of the package's API. The updated `README.md` must reflect the current, non-legacy functionality and its intended usage patterns.
3. Mark the package as reviewed in the `JSDOC-UPDATE.md` file
4. Proceed to the next unchecked package until all packages have been reviewed

# Important

- DO NOT make any changes to the code, only update JSDoc
- DO NOT include links to external resources in JSDoc
- DO NOT add `@public`, `@private` or `@internal` tags to JSDoc
- Existing testing helpers MUST be documented
- Details referring to external systems must be preserved
- All functions and methods need JSDoc, even private.
- Do not make ANY assumptions about how something works, you must verify every detail
- For interfaces, types and schemas you must review actual implementation, DO NOT assume how something functions solely based on the name or existing JSDoc
- To derive actual functionality you must drill down into every function call top to bottom first and review the entire flow within the package
- To inherit JSDoc from a parent class or interface, the correct syntax for VSCode is `@inheritdoc IFileSystem.readFileBuffer` without the {} brackets
- **Preservation of Existing Comment Content**: When refactoring or updating comments (e.g., converting to JSDoc), all semantic information from the original comment must be preserved. Existing comments should be treated as a source of truth for non-obvious code behavior, usage constraints, and design rationale. Information must **NOT** be removed unless it is factually incorrect or explicitly refers to a previous, now-nonexistent version of the code. Critical information to preserve includes, but is not limited to:
  - **Usage Constraints:** Notes on whether a function/method can be called multiple times, only once, or in a specific order.
  - **Behavioral Notes:** Explanations of edge cases, side effects, or performance implications.
  - **Rationale:** The "why" behind a specific implementation choice.
