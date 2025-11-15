# Profile Updater

This directory contains the profile updater that automatically modifies shell profile files (`.zshrc`, `.bashrc`, `profile.ps1`) to source the generated shell initialization scripts. This provides seamless integration between the dotfiles generator and the user's shell environment.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                Shell Profile Files                                     │
│                                (User's Existing)                                       │
│                                                                                         │
│  ┌─────────────────────────┐ ┌─────────────────────────┐ ┌─────────────────────────┐   │
│  │        ~/.zshrc         │ │       ~/.bashrc         │ │      ~/.config/         │   │
│  │                         │ │                         │ │       powershell/       │   │
│  │ # User's existing       │ │ # User's existing       │ │       profile.ps1       │   │
│  │ # configuration         │ │ # configuration         │ │                         │   │
│  │                         │ │                         │ │ # User's existing       │   │
│  │ export PATH="/usr/bin"  │ │ alias ll='ls -la'       │ │ # configuration         │   │
│  │ alias g='git'           │ │ export EDITOR=vim       │ │ $env:EDITOR = "code"    │   │
│  │ source ~/.zsh_custom    │ │ source ~/.bash_aliases  │ │ Import-Module PSReadLine│   │
│  └─────────────────────────┘ └─────────────────────────┘ └─────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                            │
                                            │ ProfileUpdater adds sourcing
                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                               Updated Profile Files                                    │
│                                                                                         │
│  ┌─────────────────────────┐ ┌─────────────────────────┐ ┌─────────────────────────┐   │
│  │        ~/.zshrc         │ │       ~/.bashrc         │ │      ~/.config/         │   │
│  │                         │ │                         │ │       powershell/       │   │
│  │ # User's existing       │ │ # User's existing       │ │       profile.ps1       │   │
│  │ # configuration         │ │ # configuration         │ │                         │   │
│  │                         │ │                         │ │ # User's existing       │   │
│  │ export PATH="/usr/bin"  │ │ alias ll='ls -la'       │ │ # configuration         │   │
│  │ alias g='git'           │ │ export EDITOR=vim       │ │ $env:EDITOR = "code"    │   │
│  │ source ~/.zsh_custom    │ │ source ~/.bash_aliases  │ │ Import-Module PSReadLine│   │
│  │                         │ │                         │ │                         │   │
│  │ ┌─────────────────────┐ │ │ ┌─────────────────────┐ │ │ ┌─────────────────────┐ │   │
│  │ │ # Dotfiles Generator│ │ │ │ # Dotfiles Generator│ │ │ │ # Dotfiles Generator│ │   │
│  │ │ # Auto-generated    │ │ │ │ # Auto-generated    │ │ │ │ # Auto-generated    │ │   │
│  │ │ source main.zsh     │ │ │ │ source main.bash    │ │ │ │ . main.ps1          │ │   │
│  │ └─────────────────────┘ │ │ └─────────────────────┘ │ │ └─────────────────────┘ │   │
│  └─────────────────────────┘ └─────────────────────────┘ └─────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                            │
                                            │ sources
                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           Generated Initialization Files                               │
│                                                                                         │
│  ┌─────────────────────────┐ ┌─────────────────────────┐ ┌─────────────────────────┐   │
│  │       main.zsh          │ │      main.bash          │ │       main.ps1          │   │
│  │                         │ │                         │ │                         │   │
│  │ # PATH modifications    │ │ # PATH modifications    │ │ # PATH modifications    │   │
│  │ # Environment variables │ │ # Environment variables │ │ # Environment variables │   │
│  │ # Always scripts        │ │ # Always scripts        │ │ # Always scripts        │   │
│  │   (every startup)       │ │   (every startup)       │ │   (every startup)       │   │
│  │ # Tool initializations  │ │ # Tool initializations  │ │ # Tool initializations  │   │
│  │ # Shell completions     │ │ # Shell completions     │ │ # Shell completions     │   │
│  │ # Once scripts sourcing │ │ # Once scripts sourcing │ │ # Once scripts sourcing │   │
│  │   (run once only)       │ │   (run once only)       │ │   (run once only)       │   │
│  └─────────────────────────┘ └─────────────────────────┘ └─────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

## How It Works

### Purpose

The ProfileUpdater serves as the bridge between the generated dotfiles and the user's existing shell configuration. It:

1. **Preserves User Configuration**: Never modifies existing user settings
2. **Adds Sourcing Lines**: Appends lines to source generated initialization files
3. **Handles Edge Cases**: Creates files if they don't exist, handles permissions, avoids duplicates
4. **Provides Transparency**: Adds clear comments explaining what was added and why

### IProfileUpdater Interface

```typescript
interface IProfileUpdater {
  updateProfiles(configs: ProfileUpdateConfig[]): Promise<ProfileUpdateResult[]>;
  getProfilePath(shellType: ShellType): string;
  hasSourceLine(profilePath: string, scriptPath: string): Promise<boolean>;
}

interface ProfileUpdateConfig {
  shellType: ShellType;              // 'zsh', 'bash', 'powershell'
  generatedScriptPath: string;       // Path to generated script
  onlyIfExists: boolean;             // Skip if profile doesn't exist
  projectConfigPath: string;            // Reference for comments
}

interface ProfileUpdateResult {
  shellType: ShellType;              // Shell that was processed
  profilePath: string;               // Path to profile file
  fileExists: boolean;               // Whether profile existed
  wasUpdated: boolean;               // Whether we added a sourcing line
  wasAlreadyPresent: boolean;        // Whether sourcing line already existed
}
```

## ProfileUpdater Implementation

### Profile File Locations

The updater knows the standard locations for each shell's profile file:

```typescript
getProfilePath(shellType: ShellType): string {
  switch (shellType) {
    case 'zsh':
      return path.join(homeDir, '.zshrc');
    case 'bash':
      return path.join(homeDir, '.bashrc');
    case 'powershell':
      return path.join(homeDir, '.config/powershell/profile.ps1');
  }
}
```

**Note**: PowerShell profile location is standardized to the cross-platform location. Platform-specific locations (like Windows PowerShell) could be added as needed.

### Update Process Flow

```
1. Check if profile file exists
   ├─ If doesn't exist and onlyIfExists=true → Skip
   └─ If doesn't exist and onlyIfExists=false → Continue

2. Check if sourcing line already exists
   ├─ If exists → Return (wasAlreadyPresent=true)
   └─ If missing → Continue

3. Add sourcing line
   ├─ Read existing content (or start empty)
   ├─ Append header comment block
   ├─ Append source line
   ├─ Ensure parent directories exist
   └─ Write file → Return (wasUpdated=true)
```

### Smart Duplicate Detection

The updater checks for existing sourcing lines using multiple patterns to catch different formatting styles:

```typescript
private getSourcePatterns(scriptPath: string): string[] {
  return [
    `source "${scriptPath}"`,    // Double quotes
    `source '${scriptPath}'`,    // Single quotes
    `source ${scriptPath}`,      // No quotes
    `. "${scriptPath}"`,         // Dot notation with quotes
    `. '${scriptPath}'`,         // Dot notation single quotes
    `. ${scriptPath}`,           // Dot notation no quotes
  ];
}
```

This prevents duplicate entries when:
- User manually added the line with different quoting
- Previous runs used different source syntax
- Mixed quoting styles are present

### Generated Content Format

When adding the sourcing line, the updater includes a clear header block:

#### Zsh/Bash Format
```bash
# ============================================================================
# Dotfiles Generator - Auto-generated shell initialization
# Generated from: /path/to/dotfiles.yml
# Do not edit this section manually - it will be regenerated
# ============================================================================
source "/path/to/.generated/shell-scripts/main.zsh"
```

#### PowerShell Format
```powershell
# ============================================================================
# Dotfiles Generator - Auto-generated shell initialization
# Generated from: /path/to/dotfiles.yml
# Do not edit this section manually - it will be regenerated
# ============================================================================
. "/path/to/.generated/shell-scripts/main.ps1"
```

### Safety Features

#### 1. Non-Destructive Updates
- Always appends to existing files, never overwrites
- Preserves all existing user configuration
- Creates clear boundaries with header comments

#### 2. Idempotency
- Multiple runs don't create duplicate entries
- Smart detection handles different formatting styles
- Returns accurate status about what was done

#### 3. Error Handling
- Creates parent directories if they don't exist
- Handles permission issues gracefully
- Provides detailed results for troubleshooting

#### 4. Rollback Safety
- Changes are clearly marked and isolated
- Users can easily identify and remove generated sections
- Reference to source YAML file for context

## Usage Workflow

### 1. Configuration Setup
```typescript
const configs: ProfileUpdateConfig[] = [
  {
    shellType: 'zsh',
    generatedScriptPath: '/path/to/.generated/shell-scripts/main.zsh',
    onlyIfExists: true,  // Only update if .zshrc already exists
    projectConfigPath: '/path/to/dotfiles.yml',
  },
  {
    shellType: 'bash',
    generatedScriptPath: '/path/to/.generated/shell-scripts/main.bash',
    onlyIfExists: false, // Create .bashrc if it doesn't exist
    projectConfigPath: '/path/to/dotfiles.yml',
  },
];
```

### 2. Update Execution
```typescript
const updater = new ProfileUpdater(fileSystem, homeDir);
const results = await updater.updateProfiles(configs);

for (const result of results) {
  if (result.wasUpdated) {
    console.log(`✓ Added sourcing to ${result.profilePath}`);
  } else if (result.wasAlreadyPresent) {
    console.log(`- Already configured: ${result.profilePath}`);
  } else if (!result.fileExists) {
    console.log(`- Skipped (doesn't exist): ${result.profilePath}`);
  }
}
```

### 3. Integration with Shell Generation
```typescript
// In ShellInitGenerator
export class ShellInitGenerator {
  async generate(): Promise<void> {
    // 1. Generate shell initialization files
    await this.generateShellFiles();
    
    // 2. Update profile files to source generated files
    const profileConfigs = this.createProfileConfigs();
    const results = await this.profileUpdater.updateProfiles(profileConfigs);
    
    // 3. Report results
    this.reportProfileUpdates(results);
  }
}
```

## Configuration Options

### onlyIfExists Flag

Controls whether to create profile files if they don't exist:

```typescript
// Conservative approach - only update existing files
{
  shellType: 'zsh',
  onlyIfExists: true,  // Skip if ~/.zshrc doesn't exist
}

// Aggressive approach - create files as needed
{
  shellType: 'zsh', 
  onlyIfExists: false, // Create ~/.zshrc if it doesn't exist
}
```

**Use Cases:**
- **`onlyIfExists: true`**: Respect user's shell choice, don't force configuration
- **`onlyIfExists: false`**: Ensure dotfiles work regardless of existing setup

### Cross-Platform Considerations

#### PowerShell Profiles
PowerShell has multiple profile locations depending on host and scope:
- `$PROFILE.CurrentUserCurrentHost` (most common)
- `$PROFILE.CurrentUserAllHosts`
- `$PROFILE.AllUsersCurrentHost`
- `$PROFILE.AllUsersAllHosts`

The current implementation uses a standardized cross-platform location. This can be extended to support platform-specific paths:

```typescript
// Future enhancement
getProfilePath(shellType: ShellType): string {
  if (shellType === 'powershell') {
    if (process.platform === 'win32') {
      return path.join(homeDir, 'Documents/PowerShell/profile.ps1');
    } else {
      return path.join(homeDir, '.config/powershell/profile.ps1');
    }
  }
  // ... other shells
}
```

## Benefits

### User Experience
- **Zero Manual Setup**: Users don't need to manually add sourcing lines
- **Preserve Customization**: Existing configuration is never modified
- **Clear Attribution**: Comments explain what was added and why
- **Easy Removal**: Generated sections are clearly marked for easy removal

### Development Experience
- **Automated Integration**: No manual steps required after generation
- **Consistent Behavior**: Same integration approach across all shells
- **Detailed Feedback**: Results show exactly what happened
- **Testing Friendly**: Clear interface enables comprehensive testing

### Maintenance
- **Idempotent**: Safe to run multiple times
- **Self-Documenting**: Code clearly shows intent and configuration
- **Error Resilient**: Handles edge cases and permission issues
- **Platform Agnostic**: Works consistently across operating systems

## Testing Strategy

The ProfileUpdater is designed to be easily testable:

### Unit Tests
- Mock file system operations
- Test each shell type individually
- Verify duplicate detection logic
- Test error conditions (missing directories, permissions, etc.)

### Integration Tests
- Test with real file systems (using temporary directories)
- Verify cross-platform behavior
- Test interaction with shell generators

### Edge Cases Tested
- Non-existent profile files
- Empty profile files
- Profile files with various existing sourcing lines
- Permission issues
- Missing parent directories
- Different operating systems

## Files in This Directory

```
profile-updater/
├── README.md                    # This file
├── IProfileUpdater.ts          # Interface definition
├── ProfileUpdater.ts           # Main implementation
├── index.ts                    # Module exports
└── __tests__/
    └── ProfileUpdater.test.ts  # Comprehensive tests
```

The ProfileUpdater is an essential component that provides seamless integration between the generated dotfiles and the user's existing shell environment, ensuring that the dotfiles system "just works" without requiring manual configuration steps.