# Unused TypeScript Analyzer

A script that analyzes TypeScript projects to find unused exports and unused properties in types and interfaces.

## Features

- **Finds Unused Exports**: Identifies functions, classes, types, interfaces, and constants that are exported but never imported or used elsewhere
- **Finds Unused Type Properties**: Detects properties in interfaces and type aliases that are defined but never accessed
- **Excludes Test Files**: Automatically excludes test files from analysis to avoid false positives
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
4. **Test File Exclusion**: Automatically filters out test files (files in `__tests__` directories or ending in `.test.ts` or `.spec.ts`)

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

## Limitations

- **Property Access Detection**: Properties that appear in object literals but are never accessed are still considered "used" by TypeScript's reference finder
- **Dynamic Access**: Properties accessed via computed property names (`obj[key]`) may not be detected
- **Re-exports**: Items that are re-exported through barrel files are considered used

## License

Part of the dotfiles-tool-installer project.
