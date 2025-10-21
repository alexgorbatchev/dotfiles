---
description: Project tooling requirements.
applyTo: '**/*'
---
# Project Tooling Requirements

The project is using Bun as run the main run time.

## Data Validation

- All external data such as configuration and API responses must be validated using the `zod` library.
- Zod schemas must be stored in the same directory as the module they are associated with and used to infer types for the data.
