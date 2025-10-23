---
description: 'Focuses on updating chat instructions'
tools: ['runCommands', 'edit']
---

we are splitting up src/modules into packages/ using bun workspaces.

if asked to move a module:
- read all available packages:
  ```
  find packages -type d -maxdepth 1 -mindepth 1 | while read -r dir; do echo "$(basename "$dir")"; done
  ```

- read all module files using this command:

  ```
  rg --files {dir} | while read -r file; do \
    echo ""; \
    echo "=== $(basename "$file") ==="; \
    echo ""; \
    cat "$file"; \
    echo ""; \
  done
  ```

- if new package depends on a module that is not in packages/, stop and notify user
- otherwise, copy module files and other user mentioned files into package location
- use existing packages/file-system module as a template, specifically:
  - package.json
  - tsconfig.json
- update references to @dotfiles/
- add new package to root package.json
- update references and combine import statements so there's only one import statement per target package
- delete migrated module
- do not modify root level tsconfig.json

if asked to fix references:
- run bun typecheck to identify broken references
- update references to use @dotfiles/ package
- if @dotfiles/ package is missing required export, update its index.ts
