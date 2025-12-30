# docs

## Overview
In the docs folder located **user** facing documentation.

While the code has `@dotfiles/...` imports, when published as a single package to npm, it is called `@gitea/dotfiles`, so all examples here must import from single `@gitea/dotfiles` package in all examples in the docs folder. 

Published package only exports symbols via the `packages/cli/src/schema-exports.ts`, so only those types and functions can be mentioned in the documentation.

## Critical Documentation Requirements
- We are aiming for clear, concise, and user-friendly documentation.
- Our end users are developers who want to use the project effectively.
- Avoid repeating the same examples multiple times, users don't want to have to read the same content repeatedly.
- Examples should be concise and to the point.
- Examples should build on each other, starting from the simplest possible example to more complex ones.
- Information is not repeated in multiple places, instead, it is referenced.

