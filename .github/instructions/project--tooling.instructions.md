---
description: Project tooling requirements.
applyTo: '**/*'
---
# Project Tooling Requirements

The project is using Bun as run the main run time.

## TypeScript Tooling

- Using `tsc` directly is PROHIBITED. Use `bun typecheck` instead
- Use `bun lint`, `bun fix` and `bun fmt` before task completion.

## Data Validation

- All external data such as configuration and API responses must be validated using the `zod` library.
- Zod schemas must be stored in the same directory as the module they are associated with and used to infer types for the data.

## HTTP Client Usage

- Using `fetch` directly is PROHIBITED everywhere except in core HTTP client implementations.
- All HTTP requests must go through dedicated HTTP client classes (e.g., `GitHubHttpClient`, `CargoHttpClient`).
- HTTP clients should be injected as dependencies into modules that need to make HTTP requests.
- This ensures consistent error handling, retry logic, authentication, and request/response transformation.

## File System Usage

- Importing directly from `node:fs` is PROHIBITED everywhere except in core file system implementations.
- All file system operations must go through the `IFileSystem` interface.
- File system instances should be injected as dependencies into modules that need file operations.
- This ensures consistent error handling, testing capabilities, and abstraction from Node.js specifics.

## Shell Command Usage

- Use Bun's built-in `$` shell operator for all shell command executions.
- The `$` operator provides better error handling, TypeScript integration, and performance compared to other shell execution methods.
- Shell commands should be injected as dependencies when possible for better testability.
