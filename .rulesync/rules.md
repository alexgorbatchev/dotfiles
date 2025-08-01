---
root: false
targets: ["*"]
description: 'rules'
globs:
  - '**/*'
---

# Key Requirements

## Technical Discovery and Analysis
When performing technical discovery on an external library, I must clone the library and analyze the relevant code. The analysis must be stored in the `docs` directory in markdown format and linked from the memory bank. The analysis must include the following sections:
  - **Analysis of [module name]:** This section must include a high level overview of the module and its purpose.
  - **Analysis of [module name] Implementation:** This section must include a detailed analysis of the module's implementation, how it works and must include the relevant source code snippets.
  - **Implementation Details to Replicate:** This section must include a list of implementation details that must be replicated in the project.
  - **Next Steps for Implementation:** This section must include a list of next steps that must be taken to implement the module.
  - **References:** This section must include a list of references to external resources that were used to analyze the module.

## Development Workflow
- Employ a Test-Driven Development (TDD) approach: write a failing test, then write the minimum code to make the test pass, and then refactor.
- **Run tests and linters frequently, ideally after each small, logical code change or test pass.**
- Ensure that all imported modules and types exist before referencing them.
- Create foundational files and type definitions before they are used by other modules.
- Start by defining functions or methods and their types (if shared and project-wide, define in a central types file like `src/types/*.ts` as per project convention; if module-specific, co-locate). Then incrementally write the implementation, ensuring tests pass and linting issues are addressed at each step.

## Data Validation
- All external data such as configuration and API responses must be validated using the `zod` library.
- Zod schemas must be stored in the same directory as the module they are associated with and used to infer types for the data.

## External Documentation
All external documentation provided by the user must be stored in the `docs` directory in markdown format and linked from the memory bank.

## Troubleshooting
- **Terminal commands not working?**: Check which folder current terminal session is in.

# Roo's Interaction and Response Guidelines

- **Response Style:** Do not apologize or state that the user is right. Maintain a direct and technical tone.
- **Memory Bank Alias:** The user may refer to the Memory Bank as `%mb`.