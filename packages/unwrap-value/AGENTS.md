# @dotfiles/unwrap-value

## AGENTS.md

This package provides a type and utility function for handling values that may be static, synchronous functions, or asynchronous functions.

## Key Concepts

- **Resolvable<TParams, TReturn>**: A type representing a value that can be:
  - A static value of type `TReturn`
  - A synchronous function `(params: TParams) => TReturn`
  - An asynchronous function `(params: TParams) => Promise<TReturn>`

- **resolveValue**: A function that unwraps a `Resolvable` to get the actual value

## File Structure

- `src/types.ts` - Type definitions
- `src/resolveValue.ts` - Resolution function implementation
- `src/index.ts` - Public exports
- `src/__tests__/` - Test files

## Important Notes

- This package has NO dependencies
- This package has NO logging
- All functions are pure
