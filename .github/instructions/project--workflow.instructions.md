---
description: Project development workflow requirements.
applyTo: '**/*'
---
# Project Development Workflow

## Development Approach
- **Always run tests and linters.**
- **Before completing any task involving production code changes, you MUST run the full test suite and ensure all tests pass.**
- Employ a Test-Driven Development (TDD) approach: write a failing test, then write the minimum code to make the test pass, and then refactor.
- Ensure that all imported modules and types exist before referencing them.
- Create foundational files and type definitions before they are used by other modules.
- Start by defining functions or methods and their types. Then incrementally write the implementation, ensuring tests pass and linting issues are addressed at each step.

## Task Completion Definition

A task is ONLY complete when ALL of the following are true:
- All production code changes are implemented
- Full test suite passes with 0 failures
- Type checking passes (`bun typecheck`)
- Linting passes (`bun lint`)
- Code is formatted (`bun fmt`)

Partial implementation with failing tests is NOT task completion - it is work in progress that must continue until all tests pass.

## Documentation
All documentation must be stored in the `docs` directory in markdown format.
