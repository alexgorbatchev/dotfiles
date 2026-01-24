# Script Formatters

This directory contains formatters that transform shell scripts (`OnceScript` and `AlwaysScript`) into appropriate shell initialization code. The formatters handle the different execution timing requirements and shell-specific syntax.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                       Shell Script Types                        │
│                                                                 │
│  once('script content')   always('script content')             │
│  (OnceScript)             (AlwaysScript)                       │
└─────────────┬─────────────────────────┬─────────────────────────┘
              │                         │
              ▼                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                  IScriptFormatter Interface                     │
│                                                                 │
│  format(script, toolName, shellType) → FormattedScriptOutput   │
└─────────────┬─────────────────────────┬─────────────────────────┘
              │                         │
              ▼                         ▼
┌─────────────────────────────┐   ┌─────────────────────────────────┐
│     OnceScriptFormatter     │   │    AlwaysScriptFormatter        │
│                             │   │                                 │
│  • Creates individual       │   │  • Wraps in self-executing     │
│    files in .once/          │   │    functions                    │
│  • Adds self-deletion       │   │  • Prevents variable pollution │
│  • Index-based naming       │   │  • Inline execution             │
│                             │   │                                 │
│  Output:                    │   │  Output:                        │
│  ├─ tool-0.zsh              │   │  __dotfiles_tool_always() {     │
│  ├─ tool-0.bash             │   │    # script content             │
│  └─ tool-0.ps1              │   │  }                              │
│                             │   │  __dotfiles_tool_always         │
│                             │   │  unset -f __dotfiles_tool_always│
└─────────────────────────────┘   └─────────────────────────────────┘
              │                         │
              ▼                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                  FormattedScriptOutput                          │
│                                                                 │
│  {                                                              │
│    content: string,           // Formatted shell code          │
│    requiresExecution?: boolean, // true for once scripts       │
│    outputPath?: string        // File path for once scripts    │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
```

## How It Works

### Shell Script Types

The system uses a discriminated union pattern to enforce execution timing:

```typescript
// Scripts that run only once after tool installation/updates
const onceScript = once(`
  # Generate completions (expensive operation)
  tool gen-completions --shell zsh > "$DOTFILES/.generated/completions/_tool"
`);

// Scripts that run every shell startup (lightweight operations)
const alwaysScript = always(`
  # Fast runtime setup
  export TOOL_CONFIG_DIR="$HOME/.tool"
  alias t="tool"
`);
```

### IScriptFormatter Interface

All formatters implement this interface:

```typescript
interface IScriptFormatter {
  format(script: ShellScript, toolName: string, shellType: ShellType): FormattedScriptOutput;
}

interface IFormattedScriptOutput {
  content: string; // The formatted shell code
  requiresExecution?: boolean; // Whether script needs external execution
  outputPath?: string; // File path for external scripts
}
```

## Formatter Types

### 1. AlwaysScriptFormatter

**Purpose**: Formats scripts that run every time the shell starts

**Strategy**: Wraps scripts in self-executing functions to prevent variable pollution

#### Shell-Specific Output:

**Zsh/Bash:**

```bash
# Input: always('export MY_VAR="value"')
# Output:
__dotfiles_tool_always() {
  export MY_VAR="value"
}
__dotfiles_tool_always
unset -f __dotfiles_tool_always
```

**PowerShell:**

```powershell
# Input: always('$env:MY_VAR = "value"')
# Output:
function __dotfiles_tool_always {
  $env:MY_VAR = "value"
}
__dotfiles_tool_always
Remove-Item Function:__dotfiles_tool_always
```

#### Benefits:

- **Variable Isolation**: Functions prevent local variables from polluting the global shell environment
- **Automatic Cleanup**: Functions are immediately unset after execution
- **Performance**: Lightweight execution suitable for every shell startup

### 2. OnceScriptFormatter

**Purpose**: Formats scripts that run only once after tool installation or updates

**Strategy**: Creates individual executable files that self-delete after execution

#### File Generation:

Scripts are written to `.once/` directory with index-based naming:

```
.once/
├── tool-0.zsh      # First once script for 'tool'
├── tool-1.zsh      # Second once script for 'tool'
├── other-0.bash    # First once script for 'other'
└── other-0.ps1     # PowerShell version
```

#### Shell-Specific Output:

**Zsh:**

```bash
# Generated once script - will self-delete after execution
tool gen-completions --shell zsh > "$DOTFILES/.generated/completions/_tool"
rm "/full/path/to/.once/tool-0.zsh"
```

**Bash:**

```bash
# Generated once script - will self-delete after execution
tool gen-completions --shell bash > "$DOTFILES/.generated/completions/_tool"
rm "/full/path/to/.once/tool-0.bash"
```

**PowerShell:**

```powershell
# Generated once script - will self-delete after execution
tool gen-completions --shell powershell > "$DOTFILES/.generated/completions/_tool"
Remove-Item "/full/path/to/.once/tool-0.ps1"
```

#### Benefits:

- **Performance Optimization**: Expensive operations only run once
- **Automatic Cleanup**: Scripts delete themselves to prevent re-execution
- **Version Safety**: Index-based naming prevents multiple versions from executing
- **Shell Startup Speed**: Removes expensive operations from shell initialization

## Usage Workflow

### 1. Script Creation

```typescript
// In a .tool.ts file
c.zsh(
  once /* zsh */`
    # Expensive operation - runs once
    tool gen-completions --shell zsh > "$DOTFILES/.generated/completions/_tool"
  `,
  always /* zsh */`
    # Fast setup - runs every shell startup
    export TOOL_CONFIG_DIR="$HOME/.tool"
    alias t="tool"
  `,
);
```

### 2. Formatting Process

```typescript
const alwaysFormatter = new AlwaysScriptFormatter();
const onceFormatter = new OnceScriptFormatter(shellScriptsDir);

// Format always script for inline execution
const alwaysOutput = alwaysFormatter.format(alwaysScript, 'tool', 'zsh');
// Result: Self-executing function with automatic cleanup

// Format once script for separate file
const onceOutput = onceFormatter.format(onceScript, 'tool', 'zsh', 0);
// Result: Separate file content with self-deletion
```

### 3. Integration with Shell Generation

**Always Scripts**: Embedded directly in main shell initialization file:

```bash
# main.zsh
# ... other initialization ...

# Always Scripts
__dotfiles_tool_always() {
  export TOOL_CONFIG_DIR="$HOME/.tool"
  alias t="tool"
}
__dotfiles_tool_always
unset -f __dotfiles_tool_always
```

**Once Scripts**: Written to separate files and sourced on demand:

```bash
# main.zsh
# Execute once scripts (runs only once per script)
for once_script in "/path/.once"/*.zsh(N); do
  [[ -f "$once_script" ]] && source "$once_script"
done
```

## Performance Impact

### Before Branded Types:

```bash
# Every shell startup (slow):
tool gen-completions --shell zsh > "$DOTFILES/.generated/completions/_tool" # 500ms
export TOOL_CONFIG_DIR="$HOME/.tool"  # 1ms
alias t="tool"  # 1ms
# Total: ~502ms per shell startup
```

### After Branded Types:

```bash
# First shell startup after installation:
# - Once script runs: 500ms (then deletes itself)
# - Always script runs: 2ms

# Subsequent shell startups:
# - Once script: 0ms (file no longer exists)
# - Always script: 2ms
# Total: ~2ms per shell startup (99.6% faster)
```

## Key Features

### Type Safety

- Compile-time enforcement of script categorization
- Prevents accidental misuse of expensive operations
- Clear intent through branded types

### Security

- Self-deletion prevents once scripts from running multiple times
- Full file paths prevent accidental deletions
- No executable permissions needed (scripts are sourced)

### Cross-Platform

- Consistent behavior across Zsh, Bash, and PowerShell
- Shell-specific syntax handling
- Proper cleanup commands for each shell

### Maintainability

- Clear separation between once and always logic
- Standardized formatter interface
- Easy to extend for new shells

## Files in This Directory

```
script-formatters/
├── README.md                    # This file
├── IScriptFormatter.ts         # Interface definition
├── AlwaysScriptFormatter.ts    # Formats always scripts
├── OnceScriptFormatter.ts      # Formats once scripts
└── index.ts                    # Module exports
```

This formatter system is a key component in optimizing shell startup performance while maintaining the flexibility to run expensive setup operations when needed.
