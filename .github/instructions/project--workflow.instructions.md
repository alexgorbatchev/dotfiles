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

## Troubleshooting Workflow

When user reports an issue
- First reproduce the issue locally if possible.
- Then write a test that reproduces the issue.
- Fix the issue and ensure the test passes.
- Ensure all tests pass.
- When user requests specific implementation, never switch to alternative solutions.
- CLI supports `--log=trace` for detailed logging, use it to gather more information about issues.

## Task Completion Definition

A task is ONLY complete when ALL of the following are true:
- All production code changes are implemented.
- Full test suite passes with no failures or warnings (`bun test`).
- Type checking passes (`bun typecheck`).
- Code is formatted (`bun fix`).
- Linting passes (`bun lint`).

Partial implementation with failing tests is NOT task completion - it is work in progress that must continue until all tests pass.

## Documentation
All documentation must be stored in the `docs` directory in markdown format.
