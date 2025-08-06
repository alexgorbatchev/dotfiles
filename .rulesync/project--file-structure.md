---
root: false
targets: ["*"]
description: 'file-structure'
globs:
  - '**/*'
---

# File Structure

- **Small Files & Single Responsibility:** Each file should have a single primary responsibility. Generally, this means one main export (function, class, or a complex standalone type). Associated helper types or minor interfaces directly related to this primary export can be co-located.
- **Project Types (`src/types/*.ts`):** The `src/types/*.ts` files are the designated location for all *project-wide shared types* (interfaces, type aliases) that are used across multiple modules. This file is an exception to the "single primary export" guideline and is expected to export multiple type definitions. Its single responsibility is to serve as the central repository for these shared types.
- **Module-Specific Types:** Types that are *only* used by a single module (and are not project-wide) should be co-located within that module's file, alongside its primary export (function or class).
- **Project Constants:** Project wide constants should be stored in the `src/constants.ts` file and module specific constants should be stored in the same directory as the module they are associated with.
- **Feature Modules:** Each module should have its own directory in `src/modules` directory the with a `index.ts` file that exports the feature's public API. The feature's internal implementation should be in other files in the same directory. The feature's tests should be in a `__tests__` directory next to the feature's directory (e.g., `src/modules/feature-name/__tests__/`).