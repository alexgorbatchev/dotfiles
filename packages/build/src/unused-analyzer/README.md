# Unused TypeScript Analyzer

A script that analyzes TypeScript projects to find unused exports and unused properties in types and interfaces.

## Features

- **Finds Unused Exports**: Identifies functions, classes, types, interfaces, and constants that are exported but never imported or used elsewhere
- **Finds Unused Type Properties**: Detects properties in interfaces and type aliases that are defined but never accessed
- **Structural Property Equivalence**: Handles property re-declarations across multiple interfaces - properties are considered "used" if structurally equivalent properties (same name and type) are accessed in any interface
- **Three-Tier Severity System**: Categorizes findings by severity level for better prioritization
  - **ERROR**: Completely unused code that should be removed
  - **WARNING**: Items with TODO comments that need attention
  - **INFO**: Items only used in tests (testing helpers)
- **TODO Comment Detection**: Identifies and highlights properties/types with TODO comments
- **Excludes Test Files**: Automatically excludes test files from analysis to avoid false positives (but tracks test-only usage)
- **Excludes @ts-nocheck Files**: Automatically excludes files with `// @ts-nocheck` on the first line
- **Inline Type Support**: Analyzes inline object types in addition to named interfaces and type aliases
- **VS Code Integration**: Problem matcher for displaying results in VS Code's Problems panel with severity indicators

## Limitations

- **Dynamic Access**: Properties accessed via computed property names (`obj[key]`) may not be detected
- **Re-exports**: Items that are re-exported through barrel files are considered used
- **Type Narrowing**: Properties accessed after type guards or conditional checks may not always be tracked through complex control flow

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

Each finding includes:
- File path relative to the project root
- Export/property name with location (`name:line:startColumn-endColumn`)
- Severity level (`[ERROR]`, `[WARNING]`, or `[INFO]`)
- Description of the issue

The column positions are 1-based (VS Code standard) and the range highlights the entire identifier name in VS Code's editor and Problems panel.

### Example Output

```
🔍 Analyzing TypeScript project: /path/to/tsconfig.json

🔍 Unused Exports:

packages/example/src/helpers.ts
  unusedFunction:10:1-15 [ERROR] (Unused function)
  createTestHelper:25:1-17 [INFO] (Used only in tests)

packages/example/src/constants.ts
  UNUSED_CONSTANT:20:7-22 [ERROR] (Unused const)

🔍 Unused Type/Interface Properties:

packages/example/src/types.ts
  UserConfig.unusedProp:5:3-13 [ERROR] (Unused property)
  UserConfig.futureFeature:12:3-16 [WARNING] (Unused property: [TODO] implement this later)
  TestHelpers.mockData:8:3-11 [INFO] (Used only in tests)

📊 Summary:
  Unused exports: 3
  Unused properties: 3
```

### Severity Levels

- **[ERROR]** - Completely unused code (red in VS Code)
  - Should be removed or investigated
  - No references found in production or test code

- **[WARNING]** - Items with TODO comments (yellow in VS Code)
  - Indicates planned but not yet implemented features
  - Helps track technical debt

- **[INFO]** - Used only in tests (blue in VS Code)
  - Testing helpers, mocks, or test-specific utilities
  - Defined outside test files but only referenced from tests
  - Not necessarily a problem, but good to know

## How It Works

1. **Project Loading**: Uses ts-morph to load the TypeScript project based on the provided tsconfig.json
2. **Export Analysis**: For each exported declaration, finds all references across the codebase
3. **Property Analysis**: For interfaces and type aliases, checks each property for external references
4. **Reference Categorization**: Tracks references separately:
   - Total references (definition + all usages)
   - Test references (from test files)
   - Non-test references (from production code)
5. **Severity Assignment**:
   - Items with TODO comments → WARNING
   - Items only used in tests (nonTestReferences === 1 && testReferences > 0) → INFO
   - Completely unused items → ERROR
6. **Structural Equivalence Checking**: When a property has no direct references, searches for structurally equivalent properties (same name and type signature) across all interfaces and type aliases - if any equivalent property is used, all are considered used
7. **File Exclusion**: Automatically filters out from being analyzed:
   - Test files (files in `__tests__` directories or ending in `.test.ts` or `.spec.ts`)
   - Files with `// @ts-nocheck` on the first line
   - Note: Test files are still scanned for references to track test-only usage

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
    kind: 'function' | 'class' | 'interface' | 'type' | 'enum' | 'namespace' | 'const' | 'let' | 'var' | 'export';
    severity: 'error' | 'warning' | 'info';
    onlyUsedInTests: boolean;
  }>;
  unusedProperties: Array<{
    filePath: string;
    typeName: string;
    propertyName: string;
    line: number;
    severity: 'error' | 'warning' | 'info';
    onlyUsedInTests: boolean;
    todoComment?: string;
  }>;
}
```

### formatResults(results: AnalysisResults): string

Formats analysis results into a human-readable string.

## VS Code Integration

Add this task to your `.vscode/tasks.json` to run the analyzer with problem matcher support:

```json
{
  "label": "Find Unused Exports",
  "type": "shell",
  "command": "bun",
  "args": ["run", "find-unused", "./tsconfig.json"],
  "presentation": {
    "echo": true,
    "reveal": "always",
    "focus": false,
    "panel": "shared"
  },
  "problemMatcher": {
    "owner": "unused-analyzer",
    "fileLocation": ["relative", "${workspaceFolder}"],
    "pattern": [
      {
        "regexp": "^([^\\s].*?)$",
        "file": 1
      },
      {
        "regexp": "^\\s+(.+?):(\\d+):(\\d+)-(\\d+)\\s+\\[(ERROR|WARNING|INFO)\\]\\s+\\((.+)\\)$",
        "code": 1,
        "line": 2,
        "column": 3,
        "endColumn": 4,
        "severity": 5,
        "message": 6,
        "loop": true
      }
    ]
  }
}
```

This will:
- Display results in VS Code's Problems panel
- Show severity indicators (🔴 error, 🟡 warning, 🔵 info)
- Allow clicking to navigate to the exact file location
- Highlight the entire identifier (function name, property name, etc.) in the editor
- Provide quick fixes and context

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
- Testing severity system (error/warning/info)
- Testing TODO comment extraction and display
- Testing test-only usage detection

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

## License

Part of the dotfiles-tool-installer project.
