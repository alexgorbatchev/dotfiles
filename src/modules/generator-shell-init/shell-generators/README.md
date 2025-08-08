# Shell Generators Architecture

This directory contains the shell initialization generators that create shell-specific initialization files from tool configurations. The architecture uses the Strategy pattern to eliminate code duplication while maintaining shell-specific customization.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    ShellInitGenerator                           │
│                  (orchestrates generation)                     │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  │ creates generators for each shell
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                 IShellGenerator Interface                       │
│  • extractShellContent()    • processCompletions()             │
│  • generateFileContent()    • getAdditionalFiles()             │
│  • getDefaultOutputPath()                                      │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  │ implemented by
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                  BaseShellGenerator                             │
│                   (abstract base class)                        │
│                                                                 │
│  Contains all shared business logic:                           │
│  • Script processing workflow                                  │
│  • Content attribution and hoisting                           │
│  • File generation orchestration                              │
│  • Directory management                                        │
│  • Always/Once script handling                                │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  │ uses composition with
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│              IShellStringProducer Interface                     │
│  • extractInitScripts()                                        │
│  • processCompletions()                                        │
│  • generateCompletionSetup() [optional]                       │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  │ implemented by
                  ▼
┌──────────────────┬──────────────────┬─────────────────────────────┐
│  ZshStringProducer│ BashStringProducer│ PowerShellStringProducer  │
│                  │                  │                             │
│  • Zsh-specific │  • Bash-specific │  • PowerShell-specific      │
│    syntax        │    syntax        │    syntax                   │
│  • fpath setup  │  • source files  │  • Test-Path conditions    │
│  • typeset -U    │  • [[ -f ]] &&   │  • if (Test-Path) { . }    │
│    handling      │    source        │                             │
└──────────────────┴──────────────────┴─────────────────────────────┘
                  │
                  │ used by concrete generators
                  ▼
┌──────────────────┬──────────────────┬─────────────────────────────┐
│   ZshGenerator   │  BashGenerator   │   PowerShellGenerator       │
│                  │                  │                             │
│  extends Base +  │  extends Base +  │  extends Base +             │
│  uses ZshString  │  uses BashString │  uses PowerShellString      │
│  Producer        │  Producer        │  Producer                   │
│                  │                  │                             │
│  shellType: 'zsh'│ shellType: 'bash'│ shellType: 'powershell'     │
│  extension: .zsh │ extension: .bash │ extension: .ps1             │
└──────────────────┴──────────────────┴─────────────────────────────┘
```

## How It Works

### 1. BaseShellGenerator (Abstract Base Class)

The `BaseShellGenerator` contains all the shared business logic that was previously duplicated across the three shell generators:

- **Script Processing**: Handles `always` and `once` script categorization
- **Content Attribution**: Tracks which tools contributed which configuration
- **File Generation**: Orchestrates the complete file generation workflow
- **Directory Management**: Manages output paths and additional files
- **Hoisting Logic**: Groups PATH modifications and environment variables

**Key Methods:**
```typescript
abstract class BaseShellGenerator implements IShellGenerator {
  // Shared logic methods
  extractShellContent(toolName: string, toolConfig: ToolConfig): ShellInitContent
  generateFileContent(toolContents: Map<string, ShellInitContent>): string
  getAdditionalFiles(toolContents: Map<string, ShellInitContent>): AdditionalShellFile[]
  getDefaultOutputPath(): string
  
  // Uses strategy for shell-specific operations
  processCompletions(toolName: string, completions: CompletionConfig): string[]
}
```

### 2. String Producer Strategy Classes

Each shell has a corresponding string producer that handles shell-specific syntax and conventions:

#### ZshStringProducer
```typescript
class ZshStringProducer implements IShellStringProducer {
  extractInitScripts(toolConfig: ToolConfig): ShellScript[] {
    return toolConfig.zshInit || [];
  }
  
  processCompletions(toolName: string, completions: CompletionConfig): string[] {
    // Handles fpath setup: fpath=("/path/to/completions" $fpath)
  }
  
  generateCompletionSetup(allCompletionSetup: string[], allToolInits: string[]): string[] {
    // Special handling for typeset -U fpath deduplication
  }
}
```

#### BashStringProducer
```typescript
class BashStringProducer implements IShellStringProducer {
  extractInitScripts(toolConfig: ToolConfig): ShellScript[] {
    return toolConfig.bashInit || [];
  }
  
  processCompletions(toolName: string, completions: CompletionConfig): string[] {
    // Handles sourcing: [[ -f "/path/to/completion" ]] && source "/path/to/completion"
  }
}
```

#### PowerShellStringProducer
```typescript
class PowerShellStringProducer implements IShellStringProducer {
  extractInitScripts(toolConfig: ToolConfig): ShellScript[] {
    return toolConfig.powershellInit || [];
  }
  
  processCompletions(toolName: string, completions: CompletionConfig): string[] {
    // Handles sourcing: if (Test-Path "/path/to/completion") { . "/path/to/completion" }
  }
}
```

### 3. Concrete Shell Generators

The concrete generators are now minimal - they simply extend the base class and provide a string producer:

```typescript
export class ZshGenerator extends BaseShellGenerator {
  readonly shellType: ShellType = 'zsh';
  readonly fileExtension: string = '.zsh';

  constructor(appConfig: YamlConfig) {
    super(appConfig, new ZshStringProducer(appConfig));
  }
}
```

## Workflow

1. **Tool Configuration Processing**: Each generator extracts shell-specific scripts from tool configurations using its string producer
2. **Content Aggregation**: The base class collects and organizes content from all tools
3. **Script Categorization**: Scripts are categorized as `always` (run every shell startup) or `once` (run once after installation)
4. **File Generation**: The base class orchestrates file generation with shell-specific string formatting
5. **Additional Files**: Once scripts are generated as separate files that self-delete after execution

## Benefits of This Architecture

### Code Reuse
- **Before**: ~800 lines of duplicated logic across 3 generators
- **After**: ~50 lines per generator + shared base class
- **Reduction**: ~85% less code duplication

### Maintainability
- Bug fixes and feature additions only need to be made in one place
- Shell-specific logic is clearly separated and easy to understand
- Easy to add new shells by creating new string producers

### Testability
- Shared logic is tested once in the base class
- Shell-specific behavior is isolated and easily tested
- Strategy pattern makes unit testing straightforward

## Adding a New Shell

To add support for a new shell (e.g., Fish):

1. **Create String Producer**:
```typescript
// FishStringProducer.ts
export class FishStringProducer implements IShellStringProducer {
  extractInitScripts(toolConfig: ToolConfig): ShellScript[] {
    return toolConfig.fishInit || [];
  }
  
  processCompletions(toolName: string, completions: CompletionConfig): string[] {
    // Fish-specific completion handling
  }
}
```

2. **Create Generator**:
```typescript
// FishGenerator.ts
export class FishGenerator extends BaseShellGenerator {
  readonly shellType: ShellType = 'fish';
  readonly fileExtension: string = '.fish';

  constructor(appConfig: YamlConfig) {
    super(appConfig, new FishStringProducer(appConfig));
  }
}
```

3. **Update Types**: Add `fishInit?: ShellScript[]` to `ToolConfig` interface

That's it! The new shell will automatically inherit all the shared functionality while providing shell-specific behavior through its string producer.

## Files in This Directory

```
shell-generators/
├── README.md                      # This file
├── IShellGenerator.ts            # Interface definition
├── BaseShellGenerator.ts         # Abstract base with shared logic
│
├── ZshStringProducer.ts          # Zsh-specific string generation
├── BashStringProducer.ts         # Bash-specific string generation  
├── PowerShellStringProducer.ts   # PowerShell-specific string generation
│
├── ZshGenerator.ts               # Zsh concrete generator
├── BashGenerator.ts              # Bash concrete generator
├── PowerShellGenerator.ts        # PowerShell concrete generator
│
├── ShellGeneratorFactory.ts      # Factory for creating generators
│
└── __tests__/                    # Tests for all generators
    ├── ZshGenerator.test.ts
    ├── BashGenerator.test.ts
    ├── PowerShellGenerator.test.ts
    └── ShellGeneratorFactory.test.ts
```

This architecture demonstrates the power of the Strategy pattern in eliminating code duplication while maintaining flexibility and extensibility.