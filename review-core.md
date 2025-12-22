# Package Review: core

**Grade: A** (Excellent)  
**Status:** Production-ready, strong architecture

## Package Overview

Location: `/packages/core`  
Size: 41 files, ~2,700 lines of code  
Purpose: Core types, schemas, and interfaces for the entire tool installation system

## What This Package Does

Core is the **foundation of the entire project**. It defines:

1. **Type-safe API contracts** - Builder interfaces, context objects, hooks
2. **Configuration schemas** - Zod schemas with validation for all config formats
3. **Plugin system** - Registry interfaces, type augmentation patterns
4. **Installer lifecycle** - Hook types, context objects for each phase
5. **Shell execution** - Extended shell types, script primitives

## Architecture

### Layer 1: Foundation Types

**BaseToolContext Interface:**
```typescript
interface IBaseToolContext {
  projectConfig: ProjectConfig;
  systemInfo: ISystemInfo;
  toolName: string;
}
```
- Provides common properties to all contexts
- Consistent information across installation phases
- System information injected for testability

**Platform & Architecture Enums:**
```typescript
enum Platform { Linux = 1, MacOS = 2, Windows = 4, Unix = 3, All = 7 }
enum Architecture { X86_64 = 1, Arm64 = 2, All = 3 }
```
- Bitwise flags allowing combinations
- Type-safe checks with `hasPlatform()`, `hasArchitecture()`
- Zod validation schemas included

### Layer 2: Builder Pattern API

**InstallFunction Type:**
```typescript
interface InstallFunction {
  <M extends InstallMethod>(method: M, params: IInstallParamsRegistry[M]): IToolConfigBuilder;
  (): IToolConfigBuilder; // For manual tools
}
```

**IToolConfigBuilder Interface** (16 methods):
- `bin(name, pattern?)` - Define binary
- `version(version)` - Set version
- `dependsOn(...binaries)` - Declare dependencies
- `hook(event, handler)` - Attach lifecycle hooks
- `zsh/bash/powershell(callback)` - Configure shells
- `symlink(source, target)` - Create symlinks
- `platform(platforms, configure)` - Platform-specific overrides
- `build()` - Finalize configuration

**Tool Definition Pattern:**
```typescript
export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/repo' })
    .bin('rg')
    .version('14.0.0')
    .hook('after-install', async (ctx) => { /* custom logic */ })
    .zsh(shell => shell.environment({ RG_CONFIG: '~/.ripgrep' }))
);
```

### Layer 3: Installation Lifecycle

**Phase-Specific Context Objects:**

1. **IInstallContext** (phase 1: before-install)
   - Full ToolConfig
   - Installation directory
   - Timestamp
   - Shell executor ($)
   - FileSystem instance

2. **IDownloadContext** (extends #1 + after-download)
   - downloadPath: where file was saved

3. **IExtractContext** (extends #2 + after-extract)
   - extractDir: where archive extracted
   - extractResult: list of files, executables

4. **IAfterInstallContext** (final: after-install)
   - All above properties optional
   - binaryPath, version, downloadPath optional

**Hook Type:**
```typescript
type AsyncInstallHook<T extends IInstallContext = IInstallContext> = 
  (context: T) => Promise<void>;
```

With sophisticated contravariance explanation for using `never` in collections.

### Layer 4: Configuration Schemas

**ProjectConfigSchema** (largest schema):
- paths: Directory configuration (7 fields)
- system: System settings (sudoPrompt)
- logging: Debug logging control
- updates: Tool update checking (checkOnRun, checkInterval)
- github: GitHub API config (host, token, cache, userAgent)
- cargo: Cargo API config (crates.io, githubRaw, githubRelease)
- downloader: Download settings (timeout, retries, cache)
- features: Feature toggles (catalog generation, shell installation)
- platform: Platform-specific overrides

**Key Schema Features:**
- Default values defined with examples
- Variable expansion support: `${HOME}`, `${paths.dotfilesDir}`
- Zod strict mode (.strict()) on all schemas
- Deep partial types for overrides
- Private fields (configFilePath, configFileDir) added post-validation

### Layer 5: Plugin System

**IInstallParamsRegistry:**
```typescript
interface IInstallParamsRegistry {
  // Plugins extend this via module augmentation
  // 'github-release': GithubReleaseInstallParams,
  // 'brew': BrewInstallParams,
  // etc.
}
```

**Plugin Augmentation Pattern:**
```typescript
// In installer-github/src/types.ts
declare module '@dotfiles/core' {
  interface IInstallParamsRegistry {
    'github-release': GithubReleaseInstallParams;
  }
}
```

This enables:
- Type-safe install() calls: `install('github-release', { repo: '...' })`
- Compile-time parameter validation
- IDE autocomplete for params

### Layer 6: Logging Integration

**Messages Pattern (SafeLogMessageMap):**
```typescript
export const messages = {
  pluginAlreadyRegistered: (method: string) => 
    createSafeLogMessage(`Plugin ${method} is already registered, replacing...`),
  // ...
} satisfies SafeLogMessageMap;
```

- Type-safe message templates
- All logging goes through createSafeLogMessage()
- IntelliSense shows all approved messages

## Code Quality Assessment

### Strengths ✅

1. **Architectural Clarity**
   - Clear separation into logical layers (foundation, builder, lifecycle, schemas, plugins)
   - Each component has single responsibility
   - Dependencies flow downward (no circular dependencies)

2. **Type Safety**
   - Heavy use of branded types (SafeLogMessage, OnceScript, AlwaysScript)
   - Discriminated unions for builder methods
   - Generic type parameters for flexibility
   - Zod schemas for runtime validation

3. **Documentation Excellence**
   - Comprehensive JSDoc on every interface/type
   - Usage examples throughout
   - Architecture documented (e.g., variable expansion order in paths)
   - Edge cases explained (contravariance in AsyncInstallHook<never>)

4. **Configuration Design**
   - Variable expansion with clear dependency order
   - Deep merge with null handling
   - Platform overrides with architecture support
   - Cache configuration factored out (reusable across services)

5. **Plugin System**
   - Non-invasive module augmentation
   - No coupling to specific plugins
   - Type-safe parameter passing
   - Runtime registry with composition

6. **Lifecycle Design**
   - Precise context objects for each phase
   - Immutable patterns (readonly properties)
   - Clear progression: before → download → extract → after
   - Optional fields where appropriate

7. **Shell Integration**
   - Extended shell types ($extended)
   - Branded script types (OnceScript, AlwaysScript)
   - Guard functions (isOnceScript, isAlwaysScript)
   - Script content extraction (getScriptContent)

8. **Error Types**
   - Specific archive format types (auto, tar, tar.gz, zip, 7z, dmg, deb, rpm, rar)
   - Extraction result structure clear
   - Error propagation through async hooks

### Deep Dive: Key Patterns

**Branded Types:**
```typescript
type SafeLogMessage = string & { readonly __brand: 'SafeLogMessage' };
type OnceScript = string & { readonly __brand: 'once' };
type AlwaysScript = string & { readonly __brand: 'always' };
```
- Zero runtime cost
- Compile-time enforcement
- Self-documenting code
- Impossible to misuse

**Discriminated Unions:**
```typescript
type ToolConfig = IToolConfigRegistry extends Record<string, never>
  ? never
  : IToolConfigRegistry[keyof IToolConfigRegistry];
```
- Builds union from plugin augmentations
- Type-safe across plugin boundaries
- IDE autocomplete works perfectly

**Module Augmentation for Extensibility:**
```typescript
// core doesn't know about plugins
interface IInstallParamsRegistry { }

// plugins extend it
declare module '@dotfiles/core' {
  interface IInstallParamsRegistry {
    'github-release': GithubReleaseInstallParams;
  }
}

// consumers get full type safety
install<M extends InstallMethod>(
  method: M,
  params: IInstallParamsRegistry[M]
)
```

**Contravariance Explanation:**
Package includes excellent documentation on why `AsyncInstallHook<never>` is used for heterogeneous collections:
- Bottom type extends everything
- Function parameters are contravariant
- Specific hooks can be assigned to universal bucket

### Potential Issues 🟡

1. **Large Schema Definitions**
   ```typescript
   // projectConfigSchema is 300+ lines
   ```
   - **Verdict:** Acceptable for core configuration
   - Could be split if it grows larger
   - Currently well-organized with helper factories

2. **Platform Matching Complexity**
   ```typescript
   type platformMatchSchema = z.union([
     z.object({ os: z.enum(OS_VALUES), arch: z.enum(ARCH_VALUES).optional() }),
     z.object({ os: z.enum(OS_VALUES).optional(), arch: z.enum(ARCH_VALUES) })
   ])
   ```
   - Requires either OS or arch, but not both required
   - Could use `.refine()` for clarity
   - **Current approach works fine**

3. **PartialDeep Type Complexity**
   ```typescript
   // 50+ lines of nested conditionals for deep partial
   ```
   - Necessary for configuration merging
   - TypeScript limitation (no built-in DeepPartial)
   - Well-documented with comments

4. **Download Types Duplication Note**
   ```typescript
   // In download.types.ts: File is now deprecated
   // Canonical interfaces in downloader/ package
   ```
   - **Verdict:** Clean solution - deprecated file kept for structure
   - Prevents import errors
   - Clear comments explain the situation

### InstallerPluginRegistry Analysis

**Location:** Core package  
**Purpose:** Central registry for all installer plugins

**Architecture:**
```typescript
class InstallerPluginRegistry {
  private plugins: Map<string, IInstallerPlugin>;
  private validationCache: Map<string, IValidationResult>;
  private eventHandlers: InstallEventHandler[];
  
  async register(plugin: IInstallerPlugin): Promise<void>
  composeSchemas(): void
  async install(...): Promise<AggregateInstallResult>
  async cleanup(): Promise<void>
}
```

**Key Methods:**
- `register()` - Add plugin, validate, initialize
- `composeSchemas()` - Merge all plugin schemas into discriminated union
- `install()` - Delegate to appropriate plugin
- `onEvent()` / `emitEvent()` - Event handling for hooks
- Validation caching for static validations

**Strengths:**
- Central coordination point
- Fail-fast on registration errors
- Event emission for hook processing
- Schema composition only after registration

**Log Messages:**
Package includes 12 LogMessages for plugin lifecycle:
```typescript
export const messages = {
  pluginAlreadyRegistered: (method: string) => ...,
  pluginRegistered: (method, displayName, version) => ...,
  pluginRegistrationFailed: (method) => ...,
  schemasComposed: (count, methods) => ...,
  validationFailed: (method, errors) => ...,
  delegatingToPlugin: (method) => ...,
  cleaningUpPlugins: () => ...,
  // ... 5 more for detailed tracking
} satisfies SafeLogMessageMap;
```

All follow the project's SafeLogMessage pattern perfectly.

## Integration Points

**Provides:**
- Type contracts for entire plugin system
- Configuration schema and validation
- Builder API for tool definitions
- Context objects for installation phases
- Logger interface and message patterns

**Used by:**
- All installer plugins (github, brew, cargo, curl, manual)
- cli package (command definitions)
- config package (configuration loading)
- generator packages (tool configuration)
- All code that needs type safety

## Security Assessment

**Type Safety:**
- ✅ Zod schemas validate all external input
- ✅ Union discriminators prevent invalid combinations
- ✅ Branded types prevent accidental misuse

**Configuration Security:**
- ✅ Token fields optional (can be unset)
- ✅ Environment injection controlled (env property on hooks)
- ✅ Platform matching prevents wrong-OS execution

**Plugin System:**
- ✅ Registry validates plugins on registration
- ✅ Unknown methods rejected with clear error
- ✅ Validation results logged

## Performance Impact

**Compile Time:**
- Large number of type definitions
- Some complex generic constraints
- Module augmentation patterns
- **Impact:** Minimal (type system only)

**Runtime:**
- All validation via Zod (upfront)
- Schema composition happens once
- Plugin lookup is O(1) map access
- Event emission is O(n) handlers but typically small

## Conclusion

**This is an exemplary core package** that demonstrates sophisticated TypeScript patterns and architectural thinking.

### Key Achievements

1. **Plugin System Foundation** - Enables extensibility without coupling
2. **Type-Safe Builder API** - Impossible to create invalid configurations
3. **Phase-Based Lifecycle** - Clear progression through installation
4. **Configuration Validation** - Zod schemas with sensible defaults
5. **Documentation** - Exceptional clarity on complex patterns

### Design Pattern Mastery

- **Builder pattern** - IToolConfigBuilder fluent API
- **Strategy pattern** - Pluggable install implementations
- **Registry pattern** - InstallerPluginRegistry coordination
- **Module augmentation** - Type-safe plugin extension
- **Branded types** - Type-driven enforcement
- **Discriminated unions** - Type-safe polymorphism

### Architecture Quality

The package achieves rare combination of:
- Flexibility (plugin system)
- Type safety (branded types, discriminated unions)
- Validation (Zod schemas)
- Documentation (comprehensive JSDoc)
- Simplicity (clear APIs despite complexity)

### No Critical Issues

The package is well-engineered with intentional trade-offs clearly documented.

### Recommendations

**For immediate use:** No changes needed - ready for production  
**For future enhancement:**
1. When adding new configuration fields, add to appropriate section
2. Document any new platform override patterns
3. Consider splitting very large schema if it grows beyond 400 lines

---

## File Organization

```
core/src/
├── builder/
│   ├── builder.types.ts (750 lines - Builder pattern)
│   └── index.ts
├── common/
│   ├── baseToolContext.types.ts
│   ├── common.types.ts
│   └── platform.types.ts (150 lines - Platform enums)
├── config/
│   └── projectConfigSchema.ts (600 lines - Config validation)
├── installer/
│   ├── archive.types.ts (80 lines - Archive support)
│   ├── installHooks.types.ts (150 lines - Lifecycle phases)
│   └── githubApi.types.ts (100 lines - GitHub API types)
├── types/
│   └── types.ts (300 lines - Plugin registry, result types)
├── InstallerPluginRegistry.ts (250 lines - Plugin coordination)
├── log-messages.ts (50 lines - Plugin messages)
├── shell/
│   ├── shellScript.types.ts (100 lines - Script branding)
│   └── extendedShell.types.ts
├── tool-config/
│   ├── base/ (schemas for base config)
│   ├── hooks/ (installation hooks)
│   ├── platformConfigEntrySchema.ts
│   ├── shell/ (shell configuration)
│   └── toolConfigUpdateCheckSchema.ts
└── index.ts

Total: 41 files, ~2,700 lines
```

## Metrics

- **Files:** 41 (25 type definitions, 5 schemas, 3 implementations, 8 utilities)
- **Lines:** ~2,700 (documentation-heavy)
- **Public Types:** 80+
- **Schemas:** 15+
- **Interfaces:** 50+
- **Enums:** 2 (Platform, Architecture)

---

## Related Packages

- **Depended by:** All other packages
- **Depends on:** zod, @dotfiles/logger
- **Related:** config (uses ProjectConfig), testing-helpers (mocks IBaseToolContext)

## Documentation References

- [../../docs/getting-started.md](../../docs/getting-started.md) - User guide
- [../../docs/api-reference.md](../../docs/api-reference.md) - API docs
- [../../.github/instructions/typescript--code-quality.instructions.md](../../.github/instructions/typescript--code-quality.instructions.md) - Quality standards

