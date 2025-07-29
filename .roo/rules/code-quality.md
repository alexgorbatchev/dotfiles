## Code Quality
- Line length is 120 characters.
- **Comments:**
  - The project uses GIT to track these changes and change comments are not necessary.
  - Do not comment out code, remove it instead.
  - Write JSDoc comments and keep them updated as implementation evolves (including single-line JSDoc like `/** comment */`).
- **Import Statements:**
  - Do not rename import bindings.
  - When you are editing files and there are `as Foo` imports, replace them with the actual binding name.
  - When using `@foo/bar` imports use the shortest path possible (e.g., `@foo/bar` instead of `@foo/bar/baz`).
- **Functional Purity and Side-Effect Management:**
  - **Strive for Pure Functions:** Core logic throughout the application should be implemented as pure functions where possible. A pure function's output must depend *only* on its explicit input arguments, and it must not cause side effects (e.g., modifying external state, performing I/O).
  - **Isolate Side Effects:** Operations with side effects (e.g., file system access, network requests, direct logging to console/files, reading `process.env` or system properties) must be isolated from pure core logic. These side effects should be handled at the "edges" of the application (e.g., in the main entry point, dedicated I/O modules, or specific command handlers).
  - **Dependency Injection for Effects:** Functions that orchestrate operations but need to invoke side effects must receive the necessary handlers (e.g., `FileSystem` instance, HTTP client, logger instance) as arguments.
  - **Configuration:** Configuration objects derived from external sources (like environment variables) must be created by pure functions. These functions receive all necessary raw inputs (e.g., an object representing environment variables, system properties) as arguments and should use appropriate validation (such as `zod`, per the Data Validation rule) to parse and transform these inputs into a typed configuration object. This validated configuration object is then created at the application's main entry point and passed down via dependency injection.
- **Small files:** Files should be small and focused on a single responsibility. If a file is too large, it should be broken down into smaller files. Try to keep files under 200 lines of code. Break up large test files into smaller files using `FileName--{part}.test.ts` naming convention.
- `bun run test` must always be executed from the root of the project.

## External Documentation
All external documentation provided by the user must be stored in the `docs` directory in markdown format and linked from the memory bank.

## Troubleshooting
- **Terminal commands not working?**: Check which folder current terminal session is in.

# Roo's Interaction and Response Guidelines

- **Response Style:** Do not apologize or state that the user is right. Maintain a direct and technical tone.
- **Memory Bank Alias:** The user may refer to the Memory Bank as `%mb`.
