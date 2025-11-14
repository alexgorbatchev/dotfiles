# Unused TypeScript Analyzer

A script that analyzes TypeScript projects to find unused exports and unused properties in types and interfaces.

## Features

- **Finds Unused Exports**: Identifies functions, classes, types, interfaces, and constants that are exported but never imported or used elsewhere
- **Finds Unused Type Properties**: Detects properties in interfaces and type aliases that are defined but never accessed
- **Structural Property Equivalence**: Handles property re-declarations across multiple interfaces - properties are considered "used" if structurally equivalent properties (same name and type) are accessed in any interface
- **Excludes Test Files**: Automatically excludes test files from analysis to avoid false positives
- **Excludes @ts-nocheck Files**: Automatically excludes files with `// @ts-nocheck` on the first line
- **Inline Type Support**: Analyzes inline object types in addition to named interfaces and type aliases

## Installation

```bash
cd scripts/unused-analyzer
bun install
```

## Usage

```bash
bun analyze.ts <path-to-tsconfig.json>
```

### Example

```bash
bun analyze.ts ../../tsconfig.json
```

## Output

The script outputs:

1. **Unused Exports**: Functions, types, interfaces, and constants that are exported but never used
2. **Unused Properties**: Properties in types/interfaces that are defined but never accessed
3. **Summary**: Total count of unused items found

### Example Output

```
🔍 Analyzing TypeScript project: /path/to/tsconfig.json

🔍 Unused Exports:

  /path/to/file.ts:10
    Export: unusedFunction

  /path/to/file.ts:20
    Export: UNUSED_CONSTANT

🔍 Unused Type/Interface Properties:

  /path/to/types.ts:5
    Type: UserConfig
    Property: unusedProp

📊 Summary:
  Unused exports: 2
  Unused properties: 1
```

## How It Works

1. **Project Loading**: Uses ts-morph to load the TypeScript project based on the provided tsconfig.json
2. **Export Analysis**: For each exported declaration, finds all references across the codebase
3. **Property Analysis**: For interfaces and type aliases, checks each property for external references
4. **Structural Equivalence Checking**: When a property has no direct references, searches for structurally equivalent properties (same name and type signature) across all interfaces and type aliases - if any equivalent property is used, all are considered used
5. **File Exclusion**: Automatically filters out:
   - Test files (files in `__tests__` directories or ending in `.test.ts` or `.spec.ts`)
   - Files with `// @ts-nocheck` on the first line

## API

### analyzeProject(tsConfigPath: string): AnalysisResults

Analyzes a TypeScript project and returns results.

**Parameters:**
- `tsConfigPath`: Absolute path to the tsconfig.json file

**Returns:**
```typescript
{
  unusedExports: Array<{
    filePath: string;
    exportName: string;
    line: number;
  }>;
  unusedProperties: Array<{
    filePath: string;
    typeName: string;
    propertyName: string;
    line: number;
  }>;
}
```

### formatResults(results: AnalysisResults): string

Formats analysis results into a human-readable string.

## Testing

```bash
bun test
```

The test suite includes:
- Finding unused exports (functions, constants, types, interfaces)
- Finding unused properties in interfaces
- Finding unused properties in type aliases
- Verifying used items are not reported as unused
- Checking that file paths and line numbers are included

## Advanced Features

### Structural Property Equivalence

The analyzer handles cases where properties are re-declared across multiple interfaces with the same name and type. This commonly occurs with:

- **Interface Composition**: When spreading values between different interface types
- **Type Transformations**: When converting from one type to another via object spreading
- **Shared Property Patterns**: When multiple interfaces define the same property structure

**Example:**

```typescript
// Source interface
interface SourceOptions {
  timeout: number;
  retryCount: number;
}

// Different interface with same properties
interface ProcessedOptions {
  timeout: number;      // Same name and type
  retryCount: number;   // Same name and type
  additionalOption: string;
}

// Usage through type conversion
function handler(sourceOpts: SourceOptions) {
  const processedOpts: ProcessedOptions = {
    ...sourceOpts,  // timeout and retryCount flow here
    additionalOption: 'value'
  };
  
  console.log(processedOpts.timeout);  // Accesses ProcessedOptions.timeout
}
```

In this case, `SourceOptions.timeout` and `SourceOptions.retryCount` are **not** flagged as unused, even though they're never directly accessed. The analyzer recognizes that `ProcessedOptions.timeout` and `ProcessedOptions.retryCount` are structurally equivalent and used, so their counterparts in `SourceOptions` are also considered used.

## Limitations

- **Dynamic Access**: Properties accessed via computed property names (`obj[key]`) may not be detected
- **Re-exports**: Items that are re-exported through barrel files are considered used
- **Type Narrowing**: Properties accessed after type guards or conditional checks may not always be tracked through complex control flow

## License

Part of the dotfiles-tool-installer project.
