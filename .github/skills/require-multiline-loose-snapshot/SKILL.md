---
name: require-multiline-loose-snapshot
description: Fixing the require-multiline-loose-snapshot oxlint error. Use when encountering "'toMatchLooseInlineSnapshot' needs more context, add more lines" linter error.
---

# require-multiline-loose-snapshot

Custom oxlint rule requiring `toMatchLooseInlineSnapshot` to have at least 2 content lines and preferably 3+ for proper context. This ensures snapshot matches are verified in the correct position, not just anywhere in the string.

## Error Message

```
'toMatchLooseInlineSnapshot' needs more context, add more lines.
```

## Why This Rule Exists

`toMatchLooseInlineSnapshot` replaces multiple `toContain()` calls by verifying content appears in the correct surrounding context. A single-line match can match anywhere in the string—adding context lines guarantees the match is in the right place.

```typescript
// Problem: toContain matches anywhere, no positional guarantee
expect(script).toContain('PATH=');
expect(script).toContain('export');

// Solution: toMatchLooseInlineSnapshot verifies content AND position
expect(script).toMatchLooseInlineSnapshot`
  export PATH=
  export TOOL_HOME=
`;
```

## How to Fix

**Always add more context lines.** The fix is never to switch matchers—if you're using `toMatchLooseInlineSnapshot`, you need contextual verification.

### Basic Pattern

```typescript
// ❌ BAD: Only 1 content line - no positional guarantee
expect(content).toMatchLooseInlineSnapshot`
  #!/bin/sh
`;

// ✅ GOOD: 2+ lines verifies shebang is at the start with correct following content
expect(content).toMatchLooseInlineSnapshot`
  #!/bin/sh
  # Generated file
`;
```

### With Interpolations

```typescript
// ❌ BAD: Single line could match anywhere
expect(content).toMatchLooseInlineSnapshot`
  import { defineConfig } from ${expect.anything};
`;

// ✅ GOOD: Context ensures import is followed by expected export
expect(content).toMatchLooseInlineSnapshot`
  import { defineConfig } from ${expect.anything};
  export default defineConfig({
`;
```

### Verifying Structure

```typescript
// ❌ BAD: No structural verification
expect(output).toMatchLooseInlineSnapshot`
  [INFO]
`;

// ✅ GOOD: Verifies log level appears with expected message
expect(output).toMatchLooseInlineSnapshot`
  [INFO]	Starting installation
  [INFO]	Downloading
`;
```

## Key Insight

The 2-line minimum enforces that you're testing **where** content appears, not just **that** it appears. This catches bugs where content exists but in the wrong location.
