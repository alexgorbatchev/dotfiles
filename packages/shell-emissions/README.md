# @dotfiles/shell-emissions

A standalone, shell-agnostic module for representing, organizing, and rendering shell initialization content.

## Features

- **Shell Agnostic Types**: Emission data structures contain no shell-specific syntax
- **Formatter Injection**: Consumers provide formatters; module defines only the interface
- **Structured Output**: Block-based organization with configurable headers
- **Zero Dependencies**: No runtime dependencies
- **Pure Transformations**: Given same inputs, always produces same outputs

## Installation

```bash
bun add @dotfiles/shell-emissions
```

## Quick Start

```typescript
import {
  alias,
  BlockBuilder,
  BlockRenderer,
  environment,
  fn,
  type IEmissionFormatter,
  path,
  script,
  SectionPriority,
  withPriority,
  withSource,
} from '@dotfiles/shell-emissions';

// 1. Create emissions (shell-agnostic data)
const envVars = environment({ MY_VAR: 'my-value', OTHER_VAR: 'other' });
const myAliases = alias({ ll: 'ls -la', la: 'ls -A' });
const myFunc = fn('greet', 'echo "Hello, $1!"');

// 2. Build blocks to organize emissions
const builder = new BlockBuilder();

builder.addSection('header', { priority: SectionPriority.FileHeader, isFileHeader: true });
builder.addSection('environment', { priority: SectionPriority.Environment, hoistKinds: ['environment'] });
builder.addSection('main', { priority: SectionPriority.MainContent, allowChildren: true });

builder.addEmission(envVars); // Auto-hoisted to 'environment' section
builder.addEmission(myAliases, 'my-tool'); // Added to 'main' section under 'my-tool' child block
builder.addEmission(myFunc, 'my-tool'); // Added to same child block

const blocks = builder.build();

// 3. Implement a formatter for your target shell (e.g., Zsh, Bash)
const zshFormatter: IEmissionFormatter = {
  // ... implement all required methods
};

// 4. Render the output
const renderer = new BlockRenderer();
const output = renderer.render(blocks, zshFormatter);

console.log(output.content); // The rendered shell script
console.log(output.fileExtension); // e.g., '.zsh'
console.log(output.onceScripts); // Array of once-only scripts
```

## Core Concepts

### Emissions

Emissions are shell-agnostic data structures representing content to be rendered:

| Type             | Factory                        | Description           |
| ---------------- | ------------------------------ | --------------------- |
| `environment`    | `environment(vars)`            | Environment variables |
| `alias`          | `alias(aliases)`               | Shell aliases         |
| `function`       | `fn(name, body)`               | Shell function        |
| `script`         | `script(content, timing)`      | Inline script         |
| `sourceFile`     | `sourceFile(path)`             | Source external file  |
| `sourceFunction` | `sourceFunction(functionName)` | Lazy-loaded function  |
| `completion`     | `completion(config)`           | Shell completion      |
| `path`           | `path(directory, options?)`    | PATH modification     |

### Script Timing

Scripts and source files support timing options:

- `'always'` (default) - Execute on every shell init
- `'once'` - Execute only once (creates separate script file)
- `'raw'` - Include without wrapper logic

### Hoisting

Certain emission types are automatically "hoisted" to designated sections:

- `environment` → Environment section
- `path` → Path section
- `completion` → Completions section

Non-hoisted emissions are grouped by `childBlockId` within their section.

### Source Attribution

Track where emissions originated for debugging:

```typescript
import { withSource } from '@dotfiles/shell-emissions';

const emission = withSource(alias('ll', 'ls -la'), 'my-tool');
// Adds source: 'my-tool' to the emission
```

### Priority

Override default section priority for specific emissions:

```typescript
import { withPriority } from '@dotfiles/shell-emissions';

const emission = withPriority(script('echo "first"'), 50);
// This emission will render before others with higher priority
```

## API Reference

### Factory Functions

```typescript
// Environment variables (batch)
environment(variables: Record<string, string>): EnvironmentEmission

// Aliases (batch)
alias(aliases: Record<string, string>): AliasEmission

// Function
fn(name: string, body: string): FunctionEmission

// Script
script(content: string, timing: ScriptTiming): ScriptEmission
// timing: 'always' | 'once' | 'raw'

// Source file
sourceFile(path: string): SourceFileEmission

// Source function (lazy-loaded)
sourceFunction(functionName: string): SourceFunctionEmission

// Completion
completion(config: {
  directories?: string[];  // fpath directories
  files?: string[];        // completion files to source
  commands?: string[];     // completion commands to run
}): CompletionEmission

// Path modification
path(directory: string, options?: {
  position?: 'prepend' | 'append';  // default: 'prepend'
  deduplicate?: boolean;            // default: true
}): PathEmission

// Helper: add source attribution (returns new object)
withSource<T extends Emission>(emission: T, source: string): T

// Helper: add priority override (returns new object)
withPriority<T extends Emission>(emission: T, priority: number): T
```

### Type Guards

```typescript
isEnvironmentEmission(e: Emission): e is EnvironmentEmission
isAliasEmission(e: Emission): e is AliasEmission
isFunctionEmission(e: Emission): e is FunctionEmission
isScriptEmission(e: Emission): e is ScriptEmission
isSourceFileEmission(e: Emission): e is SourceFileEmission
isSourceFunctionEmission(e: Emission): e is SourceFunctionEmission
isCompletionEmission(e: Emission): e is CompletionEmission
isPathEmission(e: Emission): e is PathEmission

// Utility guards
isHoisted(e: Emission): boolean  // Returns true for environment, path, completion
```

### BlockBuilder

```typescript
const builder = new BlockBuilder();

// Add a section (top-level block)
builder.addSection(
  id: string,
  options: {
    priority: SectionPriority;      // Render order (lower = first)
    title?: string;                 // Section header text
    hoistKinds?: EmissionKind[];    // Which emission kinds to auto-hoist here
    allowChildren?: boolean;        // Allow child blocks for non-hoisted emissions
    isFileHeader?: boolean;         // Render as file header instead of section
    isFileFooter?: boolean;         // Render as file footer instead of section
    metadata?: BlockMetadata;       // Additional metadata
  }
): BlockBuilder;

// Add an emission (routing is automatic based on hoisting)
builder.addEmission(
  emission: Emission,
  childBlockId?: string  // For non-hoisted emissions, groups into child block
): BlockBuilder;

// Build the final block array
const blocks: Block[] = builder.build();
```

### BlockRenderer

```typescript
const renderer = new BlockRenderer();

const output: RenderedOutput = renderer.render(
  blocks: Block[],
  formatter: IEmissionFormatter
);

// RenderedOutput contains:
// - content: string (the rendered shell script)
// - fileExtension: string (e.g., '.zsh')
// - onceScripts: OnceScript[] (scripts to execute once)
```

### Constants

```typescript
import { ONCE_SCRIPT_INDEX_PAD_LENGTH, SectionPriority } from '@dotfiles/shell-emissions';

SectionPriority.FileHeader; // 0
SectionPriority.Path; // 100
SectionPriority.Environment; // 200
SectionPriority.MainContent; // 300
SectionPriority.OnceScripts; // 400
SectionPriority.Completions; // 500
SectionPriority.FileFooter; // 999

ONCE_SCRIPT_INDEX_PAD_LENGTH; // 3 (for filename padding: 001, 002, etc.)
```

### Errors

```typescript
import {
  BlockValidationError,
  EmissionValidationError,
  RenderError,
} from '@dotfiles/shell-emissions';

// EmissionValidationError - thrown for invalid emission data
try {
  environment({ 'invalid-name': 'value' }); // Hyphens not allowed in variable names
} catch (e) {
  if (e instanceof EmissionValidationError) {
    console.log(e.kind); // 'environment'
    console.log(e.field); // 'variables'
    console.log(e.message); // Validation message
  }
}

// BlockValidationError - thrown for invalid block operations
// RenderError - thrown during rendering failures
```

### Formatter Interface

Consumers must implement `IEmissionFormatter`:

```typescript
interface IEmissionFormatter {
  /** File extension (e.g., '.zsh', '.bash', '.ps1') */
  readonly fileExtension: string;

  /** Renders any emission to shell-specific syntax */
  formatEmission(emission: Emission): string;

  /** Renders a once script with self-delete logic */
  formatOnceScript(emission: ScriptEmission, index: number): OnceScriptContent;

  /** Generates the loop that executes pending once scripts */
  formatOnceScriptInitializer(): string;

  /** Generates file header ("DO NOT EDIT" warning) */
  formatFileHeader(metadata?: BlockMetadata): string;

  /** Generates a section divider with title */
  formatSectionHeader(title: string): string;

  /** Generates a child block header */
  formatChildBlockHeader(block: Block): string;

  /** Generates end of file marker */
  formatFileFooter(): string;

  /** Creates a single-line comment */
  comment(text: string): string;

  /** Creates a multi-line comment block */
  commentBlock(lines: string[]): string;
}

interface FormatterConfig {
  headerWidth?: number; // Comment line width (default: 80)
  indentSize?: number; // Spaces per indent (default: 2)
  onceScriptDir?: string; // Directory for once scripts (required if any exist)
}
```

## Validation Rules

| Emission Type    | Field          | Rule                                                       |
| ---------------- | -------------- | ---------------------------------------------------------- |
| `environment`    | `variables`    | Keys must match `/^[a-zA-Z_][a-zA-Z0-9_]*$/`               |
| `alias`          | `aliases`      | Keys must match `/^[a-zA-Z_][a-zA-Z0-9_-]*$/`              |
| `function`       | `name`         | Must match `/^[a-zA-Z_][a-zA-Z0-9_-]*$/`                   |
| `function`       | `body`         | Cannot be empty                                            |
| `script`         | `content`      | Cannot be empty                                            |
| `sourceFile`     | `path`         | Cannot be empty                                            |
| `sourceFunction` | `functionName` | Must match `/^[a-zA-Z_][a-zA-Z0-9_-]*$/`                   |
| `completion`     | `config`       | Must have at least one of: directories, files, or commands |
| `path`           | `directory`    | Cannot be empty                                            |

## License

MIT
