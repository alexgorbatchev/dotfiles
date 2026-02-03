# Shell Emissions Package

## Purpose

Standalone, shell-agnostic module for representing, organizing, and rendering shell initialization content.

## Architecture

- **Zero Dependencies**: No runtime dependencies whatsoever
- **Shell Agnostic**: Emission data structures contain no shell-specific syntax
- **Formatter Injection**: Consumers provide formatters; module defines only the interface
- **Pure Transformations**: Given same inputs, always produces same outputs

## Key Concepts

- **Emission**: A shell-agnostic data structure representing content to be rendered
- **Block**: A container for organizing emissions, may contain child blocks
- **Formatter**: Consumer-provided component that converts emissions to shell syntax
- **Renderer**: Component that traverses blocks and delegates to formatter
- **Hoisting**: Routing emissions to designated sections based on emission kind

## File Organization

- `types/` - All type definitions (emissions, blocks, formatter interface)
- `emissions/` - Factory functions, type guards, validation
- `blocks/` - BlockBuilder implementation
- `renderer/` - BlockRenderer implementation
- `errors/` - Error classes

## Testing Requirements

- All tests must use `toMatchInlineSnapshot()` for output validation
- 90%+ branch coverage required
- No `toContain()` or `toMatch()` for partial string checks

## Other

- Use latest TypeScript and ECMASScript features (e.g., `Array.prototype.toSorted()`)
