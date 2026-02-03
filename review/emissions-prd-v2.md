# Product Requirements Document: Shell Emissions Module

**Version:** 2.0\
**Date:** February 1, 2026\
**Status:** Draft

---

## 1. Executive Summary

### 1.1 Purpose

Create a standalone, shell-agnostic module for representing, organizing, and rendering shell initialization content. The module provides:

1. A unified type system for shell emission data (completely shell-agnostic)
2. A block-based organization system for structuring output
3. A formatter interface that consumers implement for specific shells
4. A renderer that combines blocks and formatters to produce output

### 1.2 Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Consumer Code  │────▶│  Emissions +    │────▶│  Rendered       │
│  (e.g., tools)  │     │  Blocks +       │     │  Output +       │
│                 │     │  Formatter      │     │  Metadata       │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                              │
                        @dotfiles/emissions
```

**Input**: Emissions organized into blocks, plus a formatter instance\
**Output**: Rendered content string + file metadata (extension, permissions)

### 1.3 Goals

1. **Shell Agnostic Types**: Emission data structures contain no shell-specific syntax
2. **Formatter Injection**: Consumers provide formatters; module defines only the interface
3. **Structured Output**: Block-based organization with configurable headers
4. **Zero Dependencies**: No runtime dependencies
5. **Pure Transformations**: Given same inputs, always produces same outputs

### 1.4 Non-Goals

- Shell script execution or validation
- File system operations (consumers handle I/O)
- Providing concrete formatter implementations (consumers provide these)
- Shell completion discovery or generation
- Any knowledge of "tools" or installation systems

---

## 2. Terminology

| Term                   | Definition                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Emission**           | A shell-agnostic data structure representing content to be rendered                                                                                           |
| **EmissionKind**       | Union type of all emission discriminators: `'environment' \| 'alias' \| 'function' \| 'script' \| 'sourceFile' \| 'sourceFunction' \| 'completion' \| 'path'` |
| **Block**              | A container for organizing emissions, may contain child blocks                                                                                                |
| **Section**            | A top-level block defined via `addSection()`, used for hoisting targets                                                                                       |
| **Formatter**          | Consumer-provided component that converts emissions to shell syntax                                                                                           |
| **Renderer**           | Component that traverses blocks and delegates to formatter                                                                                                    |
| **Hoisting**           | Routing emissions to designated sections based on emission kind                                                                                               |
| **HOME Override**      | Flag indicating content should execute with modified HOME environment                                                                                         |
| **Source Attribution** | Optional string identifying where an emission originated (for comments/debugging)                                                                             |
| **Child Block ID**     | Identifier for grouping non-hoisted emissions within a section                                                                                                |

---

## 3. HOME Override Mechanism

### 3.1 Purpose

The HOME override mechanism allows relocating the HOME directory for shell initialization content. This enables:

1. **Self-Contained Output**: Generated files isolated to a single directory
2. **Testing**: Temporary HOME avoids polluting real configuration
3. **Portability**: Configurations can be moved between machines
4. **Isolation**: Multiple configurations can coexist

### 3.2 How It Works

Emissions with `homeOverride: true` signal to the formatter that the content should execute with a modified HOME environment. The formatter determines the actual shell syntax.

**This module does NOT know the syntax.** It only knows:

- Whether HOME override is requested (`homeOverride: boolean`)
- The target HOME path (provided to formatter via `FormatterConfig.homeDir`)

**Example**: If `homeDir` is `/custom/dotfiles`, a function emission with `homeOverride: true` and body `echo $HOME` should render (in Zsh) as:

```bash
myFunc() {
  (
    HOME="/custom/dotfiles"
    echo $HOME
  )
}
```

The function body executes in a subshell where `$HOME` resolves to `/custom/dotfiles`.

### 3.3 The Source File Problem

A critical limitation exists: **you cannot source a file AND override HOME simultaneously** using standard shell patterns.

**Side effects that get trapped in a subshell include:**

- Environment variables exported by the sourced file
- Functions defined in the sourced file
- Shell options set by the sourced file
- Any state the sourced file intended to persist

```bash
# This DOES NOT work - side effects are lost!
(
  HOME="/custom/dotfiles"
  source $HOME/.toolrc  # Exports and functions trapped in subshell
)
# Functions defined in .toolrc are NOT available here
```

### 3.4 Solution: Source File Emission

The `sourceFile` emission type exists specifically to solve this. The formatter must:

1. Generate a temporary function that reads file content with HOME override
2. Source the function's output via process substitution
3. Clean up the temporary function

**Concrete example** (Zsh formatter output for `sourceFile('$HOME/.toolrc', true)`):

```bash
# The function reads the file with HOME override
__source_toolrc() {
  (
    HOME="/custom/dotfiles"
    [[ -f $HOME/.toolrc ]] && cat $HOME/.toolrc
  )
}
# Process substitution sources in current shell - side effects persist!
source <(__source_toolrc)
# Clean up
unset -f __source_toolrc
```

**How it works:**

- The function runs in a subshell with modified HOME
- `cat` outputs the file content to stdout
- `source <(...)` executes that output in the **current shell**
- Exports and functions from the file are now available

This is a **formatter implementation detail** - the emission type only signals intent.

---

## 4. Emission Types

All emissions are shell-agnostic data structures. They describe **what** to emit, not **how**.

### 4.1 Environment Emission

Sets environment variables.

| Property    | Type                     | Required | Description     |
| ----------- | ------------------------ | -------- | --------------- |
| `kind`      | `'environment'`          | Yes      | Discriminator   |
| `variables` | `Record<string, string>` | Yes      | Key-value pairs |

**Hoisting**: Always hoisted to environment section.

### 4.2 Alias Emission

Defines command aliases.

| Property  | Type                     | Required | Description             |
| --------- | ------------------------ | -------- | ----------------------- |
| `kind`    | `'alias'`                | Yes      | Discriminator           |
| `aliases` | `Record<string, string>` | Yes      | Name to command mapping |

**Hoisting**: Not hoisted (stays in source's block).

### 4.3 Function Emission

Defines a callable function.

| Property       | Type         | Required | Description                                            |
| -------------- | ------------ | -------- | ------------------------------------------------------ |
| `kind`         | `'function'` | Yes      | Discriminator                                          |
| `name`         | `string`     | Yes      | Function name                                          |
| `body`         | `string`     | Yes      | Raw function body (WITHOUT declaration wrapper)        |
| `homeOverride` | `boolean`    | Yes      | Execute with modified HOME (factory defaults to false) |

**Hoisting**: Not hoisted.

**Validation**: Name must match `^[a-zA-Z_][a-zA-Z0-9_-]*$`

**Body content**: The `body` property contains ONLY the commands to execute, not the function declaration. The formatter wraps it appropriately:

```typescript
// Input
fn('greet', 'echo "Hello, $1"', false)

// Formatter outputs (Zsh):
greet() {
  echo "Hello, $1"
}

// With homeOverride: true, formatter outputs:
greet() {
  (
    HOME="/custom/dotfiles"
    echo "Hello, $1"
  )
}
```

### 4.4 Script Emission

Inline script content.

| Property       | Type                          | Required | Description                                 |
| -------------- | ----------------------------- | -------- | ------------------------------------------- |
| `kind`         | `'script'`                    | Yes      | Discriminator                               |
| `content`      | `string`                      | Yes      | Script content                              |
| `timing`       | `'always' \| 'once' \| 'raw'` | Yes      | Execution timing                            |
| `homeOverride` | `boolean`                     | No       | Execute with modified HOME (default: false) |

**Hoisting**: Not hoisted.

**Timing Semantics**:

- `always`: Runs every shell startup, wrapped with HOME override if requested
- `once`: Generates separate file that self-deletes after execution, wrapped with HOME override if requested
- `raw`: Direct emission exactly as provided (homeOverride is ignored even if set)

**Difference between `always` with `homeOverride: false` vs `raw`**:

- `always`: Formatter may add comments, spacing, or other decorations
- `raw`: Content emitted exactly as-is, no modifications whatsoever

### 4.5 Source File Emission

Sources an external file.

| Property       | Type           | Required | Description                                              |
| -------------- | -------------- | -------- | -------------------------------------------------------- |
| `kind`         | `'sourceFile'` | Yes      | Discriminator                                            |
| `path`         | `string`       | Yes      | Path to source (may contain `$HOME`)                     |
| `homeOverride` | `boolean`      | Yes      | Read file with modified HOME (factory defaults to false) |

**Hoisting**: Not hoisted.

**Note**: When `homeOverride: true`, the formatter must use the temporary function pattern described in Section 3.4.

### 4.6 Source Function Emission

Sources output of a previously defined function.

| Property       | Type               | Required | Description                |
| -------------- | ------------------ | -------- | -------------------------- |
| `kind`         | `'sourceFunction'` | Yes      | Discriminator              |
| `functionName` | `string`           | Yes      | Name of function to source |

**Hoisting**: Not hoisted.

### 4.7 Completion Emission

Configures shell completion for CLI commands.

| Property      | Type           | Required | Description                                 |
| ------------- | -------------- | -------- | ------------------------------------------- |
| `kind`        | `'completion'` | Yes      | Discriminator                               |
| `directories` | `string[]`     | No       | Directories containing completion files     |
| `files`       | `string[]`     | No       | Specific completion files to source         |
| `commands`    | `string[]`     | No       | Command names that have completions to load |

**Hoisting**: Always hoisted to completions section.

**Validation**: At least one property must be provided.

**What completions do**: Shell completions provide tab-completion suggestions. For example, typing `node <TAB>` shows available options and arguments.

**Property semantics**:

- `directories`: Paths to add to shell's completion search path (Zsh: fpath, Bash: completion dirs)
- `files`: Specific completion scripts to source directly
- `commands`: Command names whose completions should be loaded. The formatter generates the appropriate syntax (e.g., for Zsh: `compdef _node node` or loading from fpath)

**Example**:

```typescript
completion({
  directories: ['$HOME/.completions'], // Add to fpath
  commands: ['node', 'npm', 'git'], // Load completions for these commands
});
```

**Note**: Rendering is entirely formatter-specific. Zsh uses fpath + compinit, Bash uses bash-completion, etc.

### 4.8 Path Emission

Modifies the PATH environment variable.

| Property      | Type                    | Required | Description                            |
| ------------- | ----------------------- | -------- | -------------------------------------- |
| `kind`        | `'path'`                | Yes      | Discriminator                          |
| `directory`   | `string`                | Yes      | Directory to add (may contain `$HOME`) |
| `position`    | `'prepend' \| 'append'` | No       | Where to add (default: prepend)        |
| `deduplicate` | `boolean`               | No       | Emit runtime check (default: true)     |

**Hoisting**: Always hoisted to PATH section.

**Deduplication**: When `deduplicate: true`, the formatter emits **runtime shell code** that checks if the directory is already in PATH before adding. This prevents duplicate entries when the init file is sourced multiple times.

```bash
# deduplicate: true (Zsh/Bash)
if [[ ":$PATH:" != *":/usr/local/bin:"* ]]; then
  export PATH="/usr/local/bin:$PATH"
fi

# deduplicate: false
export PATH="/usr/local/bin:$PATH"
```

---

## 5. Base Emission Properties

All emissions extend a base interface:

| Property   | Type           | Required | Description                                           |
| ---------- | -------------- | -------- | ----------------------------------------------------- |
| `kind`     | `EmissionKind` | Yes      | Type discriminator                                    |
| `source`   | `string`       | No       | Attribution identifier (e.g., config file path)       |
| `priority` | `number`       | No       | Sort order within block (lower = earlier, default: 0) |

**Note**: `source` is optional attribution for documentation/debugging. It has no effect on rendering.

**Shell variables in values**: Properties like `path` in SourceFileEmission or `directory` in PathEmission may contain literal shell variables like `$HOME`. These are **NOT** substituted at render time - they are emitted as-is and resolved by the shell at runtime.

**Multi-line content**: Function bodies and script content should use JavaScript template literals for multi-line strings:

```typescript
fn(
  'setup',
  `
  echo "Setting up..."
  mkdir -p $HOME/.config
  touch $HOME/.config/settings
`,
  true,
);
```

The formatter handles indentation normalization as needed.

---

## 6. Hoisting Rules

Hoisting determines which section an emission belongs to. These rules are **fixed by emission kind**:

| Emission Kind    | Hoisted | Target Section      |
| ---------------- | ------- | ------------------- |
| `environment`    | Yes     | Environment section |
| `path`           | Yes     | PATH section        |
| `completion`     | Yes     | Completions section |
| `alias`          | No      | Source's block      |
| `function`       | No      | Source's block      |
| `script`         | No      | Source's block      |
| `sourceFile`     | No      | Source's block      |
| `sourceFunction` | No      | Source's block      |

The `isHoisted(emission)` utility returns whether an emission is hoisted based on its kind.

---

## 7. Block System

### 7.1 Block Structure

Blocks organize emissions hierarchically.

| Property    | Type            | Required | Description                     |
| ----------- | --------------- | -------- | ------------------------------- |
| `id`        | `string`        | Yes      | Unique identifier               |
| `title`     | `string`        | No       | Human-readable title for header |
| `priority`  | `number`        | Yes      | Sort order (lower = earlier)    |
| `emissions` | `Emission[]`    | Yes      | Emissions in this block         |
| `children`  | `Block[]`       | No       | Nested blocks                   |
| `metadata`  | `BlockMetadata` | No       | Additional information          |

### 7.2 Block Metadata

```typescript
interface BlockMetadata {
  description?: string; // Rendered as comment
  sourceFile?: string; // Attribution for header
  generatedAt?: Date; // Generation timestamp
}
```

### 7.3 Recommended Block Structure

Consumers define their own block structure. This is a recommended default:

| Section      | Priority | Purpose                | Config                        |
| ------------ | -------- | ---------------------- | ----------------------------- |
| File Header  | 0        | Generated file warning | `isFileHeader: true`          |
| PATH         | 100      | PATH modifications     | `hoistKinds: ['path']`        |
| Environment  | 200      | Environment variables  | `hoistKinds: ['environment']` |
| Main Content | 300      | Non-hoisted emissions  | `allowChildren: true`         |
| Completions  | 500      | Shell completions      | `hoistKinds: ['completion']`  |
| File Footer  | 999      | End marker             | `isFileFooter: true`          |

**Note**: Once Scripts (priority ~400) is automatically inserted by the renderer if any `timing: 'once'` scripts exist. Do not define this section manually.

**Section explanations:**

- **File Header/Footer**: Marked with `isFileHeader`/`isFileFooter`, rendered via formatter methods
- **PATH before Environment**: PATH must be set first so tools in PATH are available
- **Main Content**: Contains child blocks for logical groupings. Non-hoisted emissions go here.
- **Once Scripts**: Automatically inserted by renderer if needed. Not user-defined.
- **Completions last**: Must come after functions are defined, and for Zsh, fpath must be set before compinit

**Empty sections**: Sections with no emissions are omitted from output entirely (no empty headers).

**Empty child blocks**: Child blocks with no emissions are also omitted.

**Sections containing only children**: A section with `allowChildren: true` that has child blocks but no direct emissions still renders its section header.

**Block ordering**: `block.priority` determines block order within the file. `emission.priority` determines order within a single block. These are independent.

---

## 8. Formatter Interface

### 8.1 Interface Definition

```typescript
interface IEmissionFormatter {
  // Metadata
  readonly fileExtension: string; // e.g., '.zsh', '.bash', '.ps1'

  // Emission rendering - returns shell-specific syntax
  formatEmission(emission: Emission): string;

  // Once script rendering - content includes self-delete logic
  formatOnceScript(emission: ScriptEmission, index: number): OnceScriptContent;

  // Once script initializer loop (called once if any once scripts exist)
  formatOnceScriptInitializer(): string;

  // Headers - all return shell comments
  formatFileHeader(metadata?: BlockMetadata): string; // "DO NOT EDIT" warning
  formatSectionHeader(title: string): string; // Major section divider
  formatChildBlockHeader(block: Block): string; // Child block within section
  formatFileFooter(): string; // End of file marker

  // Utilities
  comment(text: string): string;
  commentBlock(lines: string[]): string;
}

interface OnceScriptContent {
  content: string; // Script content including self-delete command
  filename: string; // Generated filename for this script
}
```

````
### 8.2 Formatter Configuration

Formatters receive configuration at construction:

```typescript
interface FormatterConfig {
  homeDir: string;           // Target HOME directory (required)
  headerWidth?: number;      // Comment line width (default: 80)
  indentSize?: number;       // Spaces per indent (default: 2)
  onceScriptDir?: string;    // Directory for once scripts (required if any timing:'once' scripts exist)
}
````

**homeDir**: Always required. This is the path used when wrapping content with HOME override. Even if no emissions use `homeOverride: true`, the formatter needs this for potential future use.

**onceScriptDir**: Required if any emissions have `timing: 'once'`. The renderer throws `RenderError` if once scripts exist but this is not configured.

````
### 8.3 Escaping Requirements

Formatters MUST handle escaping for:

| Content Type | Characters to Escape |
|--------------|---------------------|
| String values | Quotes, backslashes, newlines, `$` |
| Function names | N/A (validated at creation) |
| Paths | Spaces, special characters |
| Comments | Ensure no accidental code injection |

### 8.4 Formatter Responsibilities

The formatter is responsible for ALL shell-specific knowledge:

1. **Syntax**: How to declare variables, functions, aliases
2. **HOME Override Pattern**: Subshell vs try/finally vs other
3. **Source File Pattern**: Process substitution vs other mechanisms
4. **PATH Manipulation**: Platform-specific PATH separator and syntax
5. **Completion Setup**: fpath, bash-completion, etc.
6. **Comment Syntax**: `#` vs `REM` vs other

---

## 9. Renderer

### 9.1 Interface

```typescript
interface IBlockRenderer {
  render(blocks: Block[], formatter: IEmissionFormatter): RenderedOutput;
}

interface RenderedOutput {
  content: string;           // The rendered shell content
  fileExtension: string;     // From formatter (e.g., '.zsh')
  onceScripts: OnceScript[]; // Separate files to write (empty array if none)
}

interface OnceScript {
  filename: string;          // e.g., 'my-config-001.zsh'
  content: string;           // Script content including self-delete
  executable: true;          // Constant - once scripts must be executable
}
````

### 9.2 Rendering Algorithm

```
1. Sort blocks by priority
2. For each block:
   a. If block.isFileHeader: emit formatFileHeader(block.metadata), continue
   b. If block.isFileFooter: emit formatFileFooter(), continue
   c. If block has title, emit formatSectionHeader(title)
   d. Sort block.emissions by priority
   e. For each emission:
      - If emission.source is set AND differs from previous, emit comment(source)
      - Emit formatEmission(emission)
   f. For each child block (sorted by priority):
      - Emit formatChildBlockHeader(childBlock)
      - Recursively render child's emissions
   g. Add single blank line between blocks
3. If any timing:'once' scripts were encountered:
   a. Insert formatOnceScriptInitializer() after last section with priority < 400
   b. Collect OnceScript objects from formatOnceScript() calls
4. Return RenderedOutput
```

**Once script initializer placement**: Inserted between the last section with priority < 400 and the first section with priority >= 400. If no such gap exists, inserted before completions/footer.

**Source change comments**: Only emitted when `emission.source` is defined and differs from the previous emission's source. Format determined by `formatter.comment()`.

### 9.3 Once Script Handling

When encountering a script emission with `timing: 'once'`:

1. Renderer tracks an index counter (starts at 1, increments per once script)
2. Call `formatter.formatOnceScript(emission, index)` to get content and filename
3. Add `OnceScript` to `onceScripts` array in output
4. After all blocks are processed, if `onceScripts.length > 0`:
   - Insert `formatter.formatOnceScriptInitializer()` at appropriate position

**Updated formatter interface**:

```typescript
formatOnceScript(emission: ScriptEmission, index: number): OnceScriptContent;
```

**Filename generation** (in formatter):

- If `emission.source` is defined: `{sanitized-source}-{index}.{extension}`
- If `emission.source` is undefined: `once-{index}.{extension}`
- Index is zero-padded to 3 digits (001, 002, ...), auto-incremented per render
- Sanitization replaces `/`, spaces, and special chars with `-`

**Example filenames**:

- `my-config-001.zsh` (source was `/path/to/my-config.ts`)
- `once-001.zsh` (no source attribution)

**Example once script content** (Zsh):

```bash
#!/bin/zsh
# Once script - self-deletes after execution
(
  HOME="/custom/dotfiles"
  echo "Running one-time setup..."
)
rm -f "/custom/dotfiles/.once/my-config-001.zsh"
```

**Example initializer** (Zsh):

```bash
# Execute pending once scripts
if [[ -d "/custom/dotfiles/.once" ]]; then
  for script in "/custom/dotfiles/.once"/*.zsh(N); do
    [[ -x "$script" ]] && source "$script"
  done
fi
```

---

## 10. Block Builder

### 10.1 Builder Interface

```typescript
interface IBlockBuilder {
  // Define sections (call in priority order)
  addSection(id: string, options: SectionOptions): IBlockBuilder;

  // Add emissions (routed automatically based on hoisting rules)
  addEmission(emission: Emission, childBlockId?: string): IBlockBuilder;

  // Build final structure (returns top-level blocks only, children nested within)
  build(): Block[];
}

interface SectionOptions {
  title?: string; // Section header text (omit for no header)
  priority: number; // Sort order (lower = earlier in output)
  hoistKinds?: EmissionKind[]; // Which hoisted emission kinds this section accepts
  allowChildren?: boolean; // Whether non-hoisted emissions can create child blocks here
  isFileHeader?: boolean; // True = render formatFileHeader() instead of section
  isFileFooter?: boolean; // True = render formatFileFooter() instead of section
}
```

**childBlockId parameter**: For non-hoisted emissions, this identifies which child block to place the emission in. If the child block doesn't exist, it's created with:

- `id`: The provided `childBlockId`
- `title`: Same as `childBlockId` (used for header)
- `priority`: Order of first insertion (first child = 0, second = 1, etc.)
- `emissions`: Empty array, emission added after creation
- `metadata.sourceFile`: From first emission's `source` property (if set)

Multiple emissions with the same `childBlockId` are grouped together.

**build() return value**: Returns an array of top-level blocks (sections). Each block may contain `children` array with nested child blocks.

````
### 10.2 Emission Routing

When `addEmission(emission, childBlockId?)` is called:

1. Determine if emission is hoisted via `isHoisted(emission)`
2. **If hoisted**:
   - Find section where `hoistKinds` includes `emission.kind`
   - Add emission to that section's `emissions` array
   - Error if no section accepts this hoisted kind
3. **If not hoisted**:
   - Find section with `allowChildren: true`
   - If `childBlockId` provided: add to/create child block with that ID
   - If `childBlockId` omitted: add to section's direct `emissions` array
   - Error if no section allows children

**Duplicate handling**: Multiple emissions can have the same values. The renderer emits all of them. Consumers are responsible for avoiding duplicates if that's undesired.

**Function ordering**: Emissions are rendered in priority order within each block. Ensure function definitions have lower priority than emissions that reference them (like `sourceFunction`).

### 10.3 Usage Example

```typescript
const builder = new BlockBuilder()
  .addSection('header', { priority: 0, isFileHeader: true })
  .addSection('path', { 
    title: 'PATH Modifications', 
    priority: 100, 
    hoistKinds: ['path'] 
  })
  .addSection('env', { 
    title: 'Environment Variables', 
    priority: 200, 
    hoistKinds: ['environment'] 
  })
  .addSection('main', { 
    title: 'Initializations', 
    priority: 300, 
    allowChildren: true 
  })
  .addSection('completions', { 
    title: 'Shell Completions', 
    priority: 500, 
    hoistKinds: ['completion'] 
  })
  .addSection('footer', { priority: 999, isFileFooter: true });

// Add emissions - routing is automatic
builder.addEmission(environment({ PATH_VAR: 'value' }));  // → env section
builder.addEmission(path('/usr/local/bin'));              // → path section
builder.addEmission(fn('init', 'echo hi', true), 'my-config'); // → main/my-config
````

---

## 11. Factory Functions

### 11.1 Emission Factories

```typescript
function environment(variables: Record<string, string>): EnvironmentEmission;
function alias(aliases: Record<string, string>): AliasEmission;
function fn(name: string, body: string, homeOverride?: boolean): FunctionEmission;
function script(content: string, timing: ScriptTiming, homeOverride?: boolean): ScriptEmission;
function sourceFile(path: string, homeOverride?: boolean): SourceFileEmission;
function sourceFunction(functionName: string): SourceFunctionEmission;
function completion(config: CompletionConfig): CompletionEmission;
function path(directory: string, options?: PathOptions): PathEmission;
```

**Supporting types**:

```typescript
type ScriptTiming = 'always' | 'once' | 'raw';

interface CompletionConfig {
  directories?: string[]; // Completion search paths
  files?: string[]; // Specific completion files to source
  commands?: string[]; // Commands to load completions for
}

interface PathOptions {
  position?: 'prepend' | 'append'; // Default: 'prepend'
  deduplicate?: boolean; // Default: true
}
```

**Default values**:

- `homeOverride` defaults to `false` when omitted
- `PathOptions.position` defaults to `'prepend'`
- `PathOptions.deduplicate` defaults to `true`

**Why `fn` and `path`?**:

- `fn` because `function` is a JavaScript reserved word
- `path` (not `pathMod`) for simplicity - unlikely to conflict in typical usage

### 11.2 Setting Source Attribution

Factory functions return emissions without `source`. Set it separately:

```typescript
const emission = fn('init', 'echo hi', true);
emission.source = '/path/to/config.ts'; // Optional attribution

// Or use a helper
function withSource<T extends Emission>(emission: T, source: string): T {
  emission.source = source;
  return emission;
}
```

### 11.3 Type Guards

```typescript
function isEnvironmentEmission(e: Emission): e is EnvironmentEmission;
function isAliasEmission(e: Emission): e is AliasEmission;
function isFunctionEmission(e: Emission): e is FunctionEmission;
function isScriptEmission(e: Emission): e is ScriptEmission;
function isSourceFileEmission(e: Emission): e is SourceFileEmission;
function isSourceFunctionEmission(e: Emission): e is SourceFunctionEmission;
function isCompletionEmission(e: Emission): e is CompletionEmission;
function isPathEmission(e: Emission): e is PathEmission;

function isHoisted(e: Emission): boolean;
function needsHomeOverride(e: Emission): boolean;
```

---

## 12. Validation

### 12.1 Emission Validation

Validation occurs in factory functions:

| Emission       | Validation Rules                                            |
| -------------- | ----------------------------------------------------------- |
| Environment    | Variable names: `^[a-zA-Z_][a-zA-Z0-9_]*$`                  |
| Alias          | Alias names: `^[a-zA-Z_][a-zA-Z0-9_-]*$`                    |
| Function       | Function names: `^[a-zA-Z_][a-zA-Z0-9_-]*$`, body non-empty |
| Script         | Content non-empty                                           |
| SourceFile     | Path non-empty                                              |
| SourceFunction | Function name matches pattern                               |
| Completion     | At least one config option provided                         |
| Path           | Directory non-empty                                         |

### 12.2 Block Validation

- Block IDs must be unique
- Priorities must be non-negative integers
- Children only allowed in sections with `allowChildren: true`

---

## 13. Error Handling

### 13.1 Error Types

```typescript
class EmissionValidationError extends Error {
  constructor(
    public readonly emissionKind: EmissionKind,
    public readonly field: string,
    public readonly message: string,
  ) {}
}

class BlockValidationError extends Error {
  constructor(
    public readonly blockId: string,
    public readonly message: string,
  ) {}
}

class RenderError extends Error {
  constructor(
    public readonly emission: Emission,
    public readonly message: string,
  ) {}
}
```

### 13.2 Error Behavior

- Factory functions throw `EmissionValidationError` immediately on invalid input
- `BlockBuilder.build()` throws `BlockValidationError` for structural issues
- Formatters should throw `RenderError` if they cannot render an emission

---

## 14. Public API

### 14.1 Exports

```typescript
// Types
export type {
  AliasEmission,
  CompletionConfig,
  CompletionEmission,
  Emission,
  EmissionKind,
  EnvironmentEmission,
  FunctionEmission,
  PathEmission,
  PathOptions,
  ScriptEmission,
  ScriptTiming,
  SourceFileEmission,
  SourceFunctionEmission,
};

export type {
  Block,
  BlockMetadata,
  SectionOptions,
};

export type {
  FormatterConfig,
  IBlockRenderer,
  IEmissionFormatter,
  OnceScript,
  RenderedOutput,
};

// Factory functions
export {
  alias,
  completion,
  environment,
  fn,
  path,
  script,
  sourceFile,
  sourceFunction,
  withSource,
};

// Type guards
export {
  isAliasEmission,
  isCompletionEmission,
  isEnvironmentEmission,
  isFunctionEmission,
  isHoisted,
  isPathEmission,
  isScriptEmission,
  isSourceFileEmission,
  isSourceFunctionEmission,
  needsHomeOverride,
};

// Builder and Renderer
export { BlockBuilder };
export { BlockRenderer };

// Errors
export { BlockValidationError, EmissionValidationError, RenderError };
```

### 14.2 Usage Example

```typescript
import {
  BlockBuilder,
  BlockRenderer,
  environment,
  fn,
  type IEmissionFormatter,
  path,
  sourceFunction,
  withSource,
} from '@dotfiles/shell-emissions';

// Consumer provides formatter
import { ZshFormatter } from '@my-app/formatters';

// Create emissions with source attribution
const configPath = '/path/to/config.ts';
const emissions = [
  withSource(environment({ NODE_ENV: 'production' }), configPath),
  withSource(path('/usr/local/bin'), configPath),
  withSource(fn('initTool', 'tool env --use-on-cd', true), configPath),
  withSource(sourceFunction('initTool'), configPath),
];

// Build block structure
const builder = new BlockBuilder()
  .addSection('header', { priority: 0, isFileHeader: true })
  .addSection('path', { title: 'PATH', priority: 100, hoistKinds: ['path'] })
  .addSection('env', { title: 'Environment', priority: 200, hoistKinds: ['environment'] })
  .addSection('main', { title: 'Initializations', priority: 300, allowChildren: true })
  .addSection('footer', { priority: 999, isFileFooter: true });

// Add emissions - they route automatically
emissions.forEach((e) => builder.addEmission(e, 'my-config'));

const blocks = builder.build();

// Render with consumer's formatter
const formatter = new ZshFormatter({
  homeDir: '/home/user/.dotfiles',
  onceScriptDir: '/home/user/.dotfiles/.once',
});
const renderer = new BlockRenderer();
const output = renderer.render(blocks, formatter);

// Output contains:
// - content: string (the rendered shell file)
// - fileExtension: string (e.g., '.zsh')
// - onceScripts: OnceScript[] (separate files to write)
```

---

## 15. Implementation Requirements

### 15.1 Standalone NPM Package

This module is **completely standalone** and publishable to NPM:

1. **Zero Dependencies**: No runtime dependencies whatsoever
2. **No Internal Imports**: Must not import from any `@dotfiles/*` packages
3. **Self-Contained Types**: All types defined within the package
4. **Independent Versioning**: Can be versioned and published separately
5. **Universal Compatibility**: Works with any JavaScript/TypeScript runtime

**package.json requirements:**

```json
{
  "name": "@dotfiles/shell-emissions",
  "version": "1.0.0",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts"
    }
  },
  "dependencies": {},
  "devDependencies": {},
  "peerDependencies": {}
}
```

### 15.2 Testing Requirements

**Runtime**: Bun test only. No Jest, Vitest, or other test runners.

**MANDATORY**: All tests must use `toMatchInlineSnapshot()` for output validation.

**PROHIBITED**:

- `toContain()` for output validation
- `toMatch()` for partial string checks
- `toInclude()` or similar partial matchers
- Any test that validates output without capturing the complete structure

**Rationale**: Partial string checks hide regressions. Full snapshots ensure:

1. Complete output is captured and reviewed
2. Any change to output is visible in diffs
3. Formatter behavior is fully documented in tests
4. No hidden side effects from implementation changes

**Example - CORRECT:**

```typescript
it('renders environment emission', () => {
  const emission = environment({ NODE_ENV: 'production' });
  const result = formatter.formatEmission(emission);

  expect(result).toMatchInlineSnapshot(`
    export NODE_ENV="production"
  `);
});

it('renders block with multiple emissions', () => {
  const output = renderer.render(blocks, formatter);

  expect(output.content).toMatchInlineSnapshot(`
    # === Environment ===
    export NODE_ENV="production"
    export DEBUG="false"
    
    # === Functions ===
    myFunc() {
      echo "hello"
    }
  `);
});
```

**Example - PROHIBITED:**

```typescript
// ❌ WRONG: partial check hides actual output
it('renders environment emission', () => {
  const result = formatter.formatEmission(emission);
  expect(result).toContain('NODE_ENV');
  expect(result).toContain('production');
});

// ❌ WRONG: regex partial match
it('renders function', () => {
  const result = formatter.formatEmission(fn);
  expect(result).toMatch(/myFunc\(\)/);
});
```

### 15.3 Test Coverage

- **Minimum Coverage**: 90% branch coverage
- **Every emission type**: Full snapshot test for each of the 8 types
- **Every formatter method**: Snapshot test for expected output
- **Every error case**: Snapshot test for error messages
- **Hoisting logic**: Snapshot tests for block structure after hoisting
- **Renderer output**: Full file snapshot for integration tests

---

## 16. Completion Criteria

### 16.1 Type System (Phase 1)

- [ ] All 8 emission types defined with TypeScript interfaces
- [ ] Base emission interface with `kind`, `source`, `priority`
- [ ] `EmissionKind` union type
- [ ] Block and BlockMetadata interfaces
- [ ] All types exported from package index

### 16.2 Factory Functions (Phase 1)

- [ ] Factory function for each emission type
- [ ] Validation in factory functions (throws `EmissionValidationError`)
- [ ] `withSource()` helper function
- [ ] Unit tests for all factories
- [ ] Unit tests for validation errors

### 16.3 Type Guards (Phase 1)

- [ ] Type guard for each emission type
- [ ] `isHoisted()` function (based on emission kind)
- [ ] `needsHomeOverride()` function
- [ ] Unit tests for all guards

### 16.4 Formatter Interface (Phase 1)

- [ ] `IEmissionFormatter` interface defined
- [ ] `FormatterConfig` type defined
- [ ] `RenderedOutput` type defined
- [ ] Documentation for formatter implementers

### 16.5 Block Builder (Phase 2)

- [ ] Fluent builder API
- [ ] Automatic emission routing by hoisting rules
- [ ] Child block management
- [ ] Priority-based sorting
- [ ] Source attribution tracking
- [ ] Unit tests for all routing scenarios

### 16.6 Block Renderer (Phase 2)

- [ ] Implements rendering algorithm
- [ ] Respects priority ordering
- [ ] Handles once script collection
- [ ] Returns `RenderedOutput` with metadata
- [ ] Integration tests with mock formatter

### 16.7 Documentation

- [ ] README with architecture overview
- [ ] API reference for all exports
- [ ] Formatter implementation guide
- [ ] Example formatter implementation

### 16.8 Quality Gates

- [ ] 90%+ code coverage
- [ ] No TypeScript errors (strict mode)
- [ ] All public APIs have JSDoc
- [ ] No circular dependencies
- [ ] Zero runtime dependencies

---

## 17. Dependencies

### 17.1 Runtime Dependencies

**None** - this module has zero runtime dependencies.

### 17.2 Development Dependencies

**None** - uses workspace-level Bun and TypeScript only.

- TypeScript provided by workspace root
- Bun test (built into Bun runtime)
- ESLint provided by workspace root

### 17.3 Peer Dependencies

**None** - consumers provide their own formatters.

---

## 18. Package Structure

```
packages/shell-emissions/
├── package.json
├── README.md
├── tsconfig.json
├── src/
│   ├── index.ts                    # Public exports
│   │
│   ├── types/
│   │   ├── index.ts
│   │   ├── emissions.ts            # All emission type definitions
│   │   ├── blocks.ts               # Block type definitions
│   │   └── formatter.ts            # Formatter interface
│   │
│   ├── emissions/
│   │   ├── index.ts
│   │   ├── factories.ts            # Factory functions
│   │   ├── guards.ts               # Type guards
│   │   └── validation.ts           # Validation logic
│   │
│   ├── blocks/
│   │   ├── index.ts
│   │   └── BlockBuilder.ts
│   │
│   ├── renderer/
│   │   ├── index.ts
│   │   └── BlockRenderer.ts
│   │
│   ├── errors/
│   │   ├── index.ts
│   │   ├── EmissionValidationError.ts
│   │   ├── BlockValidationError.ts
│   │   └── RenderError.ts
│   │
│   └── __tests__/
│       ├── emissions/
│       ├── blocks/
│       ├── renderer/
│       └── integration/
```

---

## 19. Revision History

| Version | Date       | Author | Changes                                                                                                    |
| ------- | ---------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| 1.0     | 2026-02-01 | -      | Initial draft                                                                                              |
| 2.0     | 2026-02-01 | -      | Complete rewrite: removed tool concepts, made type system shell-agnostic, formatters now consumer-provided |
