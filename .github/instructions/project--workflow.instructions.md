---
description: Project development workflow requirements.
applyTo: '**/*'
---
# Project Development Workflow

## Development Approach
- **Always run tests and linters.**
- Employ a Test-Driven Development (TDD) approach: write a failing test, then write the minimum code to make the test pass, and then refactor.
- Ensure that all imported modules and types exist before referencing them.
- Create foundational files and type definitions before they are used by other modules.
- Start by defining functions or methods and their types. Then incrementally write the implementation, ensuring tests pass and linting issues are addressed at each step.

## Documentation
All documentation must be stored in the `docs` directory in markdown format.
