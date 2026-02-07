---
targets:
  - '*'
root: false
description: file-structure
globs:
  - '**/*'
---

# File Structure

- **Small Files & Single Responsibility:** Each file should have a single primary responsibility. Generally, this means one main export (function, class, or a complex standalone type). Associated helper types or minor interfaces directly related to this primary export can be co-located.
- **Workspace Packages (`packages/`):** The project uses a workspace structure with packages located in the `packages/` directory. Each package is a self-contained module with its own `package.json`, source code, tests, and documentation. All features must be implemented as packages in the `packages/` directory.
- **Package Structure:** Each package should have its own directory in `packages/` with an `index.ts` file that exports the package's public API. The package's internal implementation should be in other files in the same directory. The package's tests should be in a `__tests__` directory next to the package's source files.
- **Package Types:** Types that are used across multiple files within a package should be in a `types.ts` file in that package. Types that are only used by a single file should be co-located within that file.
- **Package Constants:** Package-wide constants should be stored in a `constants.ts` file in the package directory. Constants used by a single file should be co-located within that file.
