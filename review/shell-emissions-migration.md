# Shell Emissions Migration Plan

This document provides a comprehensive migration plan for integrating the newly implemented `@dotfiles/shell-emissions` package with the existing `shell-init-generator` package.

## Table of Contents

- [Executive Summary](#executive-summary)
- [Architecture Overview](#architecture-overview)
- [Type Mapping Reference](#type-mapping-reference)
- [Phase 1: Create Shell Formatters](#phase-1-create-shell-formatters)
- [Phase 2: Adapter Layer](#phase-2-adapter-layer)
- [Phase 3: Generator Integration](#phase-3-generator-integration)
- [Phase 4: Deprecation and Cleanup](#phase-4-deprecation-and-cleanup)
- [Risk Areas and Mitigations](#risk-areas-and-mitigations)
- [Testing Strategy](#testing-strategy)
- [Rollback Considerations](#rollback-considerations)

---

## Executive Summary

### Current State

The `shell-init-generator` package uses:

- `IShellInitContent` interface with 9 string array fields
- Shell-specific `*StringProducer` classes for syntax generation
- Separate `*ScriptFormatter` classes for script wrapping
- String concatenation in `BaseShellGenerator.generateFileContent()`

### Target State

Integration with `@dotfiles/shell-emissions`:

- Typed emission objects with discriminated unions (`ShellEmission`)
- `BlockBuilder` for automatic hoisting and section organization
- `BlockRenderer` delegating to shell-specific `IEmissionFormatter` implementations
- Explicit block structure with `SectionPriority` ordering

### Key Changes

| Aspect     | Before                                                  | After                                       |
| ---------- | ------------------------------------------------------- | ------------------------------------------- |
| Data Model | `IShellInitContent` (string arrays)                     | `ShellEmission[]` (typed objects)           |
| Hoisting   | Implicit in `collectHoistedContent()`                   | Explicit via `isHoisted()` type guard       |
| Formatting | Scattered across `*StringProducer` + `*ScriptFormatter` | Consolidated `IEmissionFormatter` per shell |
| Structure  | Hardcoded in `generateFileContent()`                    | Configurable via `BlockBuilder`             |

---

## Architecture Overview

### New Package Dependency Graph

```
@dotfiles/core
    ↓
@dotfiles/shell-emissions (NEW - types only, no shell-specific syntax)
    ↓
@dotfiles/shell-init-generator (provides IEmissionFormatter implementations)
```

### New File Structure in shell-init-generator

```
shell-init-generator/src/
├── formatters/                          # NEW: IEmissionFormatter implementations
│   ├── ZshEmissionFormatter.ts          # NEW
│   ├── BashEmissionFormatter.ts         # NEW
│   ├── PowerShellEmissionFormatter.ts   # NEW
│   ├── EmissionFormatterFactory.ts      # NEW
│   └── index.ts                         # NEW
├── adapters/                            # NEW: Transition layer
│   ├── EmissionAdapter.ts               # NEW: IShellInitContent → Emission[]
│   └── index.ts                         # NEW
├── shell-generators/
│   ├── BaseShellGenerator.ts            # MODIFY: Use BlockRenderer
│   ├── ZshGenerator.ts                  # MODIFY: Wire up ZshEmissionFormatter
│   ├── BashGenerator.ts                 # MODIFY: Wire up BashEmissionFormatter
│   └── PowerShellGenerator.ts           # MODIFY: Wire up PowerShellEmissionFormatter
├── string-producers/                    # DEPRECATE in Phase 4
│   ├── ZshStringProducer.ts
│   ├── BashStringProducer.ts
│   └── PowerShellStringProducer.ts
└── script-formatters/                   # DEPRECATE in Phase 4
    ├── AlwaysScriptFormatter.ts
    ├── OnceScriptFormatter.ts
    └── FunctionScriptFormatter.ts
```

---

## Type Mapping Reference

### IShellInitContent → Emission Types

| IShellInitContent Field                    | Emission Type                            | Notes                                 |
| ------------------------------------------ | ---------------------------------------- | ------------------------------------- |
| `environmentVariables: string[]`           | `EnvironmentEmission`                    | Hoisted to Environment section        |
| `pathModifications: string[]`              | `PathEmission`                           | Hoisted to Path section               |
| `toolInit: string[]`                       | `AliasEmission`                          | Non-hoisted, per-tool section         |
| `functions: ShellFunction[]`               | `FunctionEmission`                       | Non-hoisted, uses `needsHomeOverride` |
| `alwaysScripts: AlwaysScript[]`            | `ScriptEmission` with `timing: 'always'` | Wrapped in subshell                   |
| `onceScripts: OnceScript[]`                | `ScriptEmission` with `timing: 'once'`   | OnceScripts section                   |
| `rawScripts: RawScript[]`                  | `ScriptEmission` with `timing: 'raw'`    | No wrapping                           |
| `completionSetup: ShellCompletionConfig[]` | `CompletionEmission`                     | Hoisted to Completions section        |
| `configFilePath: string`                   | Block metadata (not emission)            | Stored in `BlockMetadata.sourceFile`  |

### ShellScript → ScriptEmission Mapping

```typescript
// Current (core package)
type ShellScript = OnceScript | AlwaysScript | RawScript;
// { kind: 'once' | 'always' | 'raw', value: string }

// New (shell-emissions package)
interface ScriptEmission {
  type: 'script';
  content: string;
  timing: 'always' | 'once' | 'raw';
  needsHomeOverride: boolean; // true for 'always', false for 'once'/'raw'
  identifier?: string;
}
```

### Hoisting Rules

Emissions with these types are automatically hoisted by `BlockBuilder`:

| Emission Type         | Target Section | Priority |
| --------------------- | -------------- | -------- |
| `PathEmission`        | Path           | 100      |
| `EnvironmentEmission` | Environment    | 200      |
| `CompletionEmission`  | Completions    | 500      |

Non-hoisted emissions remain in their tool's `MainContent` section (priority 300).

---

## Phase 1: Create Shell Formatters

### Objective

Implement `IEmissionFormatter` for each supported shell, consolidating logic from `*StringProducer` and `*ScriptFormatter` classes.

### New Files to Create

#### 1. `formatters/ZshEmissionFormatter.ts`

```typescript
// Source logic from:
// - ZshStringProducer.ts (completion, environment, alias syntax)
// - AlwaysScriptFormatter.ts (subshell wrapping)
// - OnceScriptFormatter.ts (once script generation)
// - FunctionScriptFormatter.ts (function wrapping)
// - shellTemplates.ts (headers, section banners)
```

**Implementation Requirements:**

| Method                          | Source Logic From                                        |
| ------------------------------- | -------------------------------------------------------- |
| `formatEnvironment()`           | `ZshStringProducer.formatEnvironmentVariables()`         |
| `formatPath()`                  | `ZshStringProducer.formatPathModification()`             |
| `formatAlias()`                 | `ZshStringProducer.formatAliases()`                      |
| `formatFunction()`              | `FunctionScriptFormatter.format()` + HOME override logic |
| `formatScript()`                | `AlwaysScriptFormatter.format()` for timing='always'     |
| `formatOnceScript()`            | `OnceScriptFormatter.format()`                           |
| `formatOnceScriptInitializer()` | `OnceScriptInitializer.generate()`                       |
| `formatSourceFile()`            | New: `source "/path/to/file"`                            |
| `formatSourceFunction()`        | New: `source <(functionName)`                            |
| `formatCompletion()`            | `CompletionGenerator` logic for zsh                      |
| `formatFileHeader()`            | `shellTemplates.fileHeader()`                            |
| `formatFileFooter()`            | `shellTemplates.fileFooter()`                            |
| `formatSectionHeader()`         | `shellTemplates.sectionHeader()`                         |
| `formatToolHeader()`            | `shellTemplates.toolHeader()`                            |
| `formatComment()`               | New: `# comment text`                                    |

#### 2. `formatters/BashEmissionFormatter.ts`

Same interface as `ZshEmissionFormatter` with Bash-specific syntax differences:

- Completions use different mechanism
- Some environment variable quoting differences

#### 3. `formatters/PowerShellEmissionFormatter.ts`

PowerShell-specific syntax:

- `$env:VAR = "value"` for environment
- Different function syntax
- Different completion mechanism

#### 4. `formatters/EmissionFormatterFactory.ts`

```typescript
import type { ShellType } from '@dotfiles/core';
import type { FormatterConfig, IEmissionFormatter } from '@dotfiles/shell-emissions';
import { BashEmissionFormatter } from './BashEmissionFormatter';
import { PowerShellEmissionFormatter } from './PowerShellEmissionFormatter';
import { ZshEmissionFormatter } from './ZshEmissionFormatter';

export function createEmissionFormatter(
  shellType: ShellType,
  config: FormatterConfig,
): IEmissionFormatter {
  switch (shellType) {
    case 'zsh':
      return new ZshEmissionFormatter(config);
    case 'bash':
      return new BashEmissionFormatter(config);
    case 'powershell':
      return new PowerShellEmissionFormatter(config);
  }
}
```

#### 5. `formatters/index.ts`

```typescript
export { BashEmissionFormatter } from './BashEmissionFormatter';
export { createEmissionFormatter } from './EmissionFormatterFactory';
export { PowerShellEmissionFormatter } from './PowerShellEmissionFormatter';
export { ZshEmissionFormatter } from './ZshEmissionFormatter';
```

### Dependencies

- `@dotfiles/shell-emissions` must be added to `shell-init-generator/package.json`

### Testing Requirements

- Unit tests for each formatter method
- Snapshot tests comparing output to current `*StringProducer` output
- Test HOME override logic for functions and always scripts
- Test once script file path generation

---

## Phase 2: Adapter Layer

### Objective

Create an adapter that converts existing `IShellInitContent` to `ShellEmission[]`, enabling gradual migration.

### New Files to Create

#### 1. `adapters/EmissionAdapter.ts`

```typescript
import { isAlwaysScript, isOnceScript, isRawScript } from '@dotfiles/core';
import type { ShellEmission } from '@dotfiles/shell-emissions';
import {
  alias,
  completion,
  environment,
  fn,
  path,
  script,
  sourceFunction,
} from '@dotfiles/shell-emissions';
import type { IShellInitContent, ShellFunction } from '../types';

export function adaptShellInitContentToEmissions(
  content: IShellInitContent,
  toolName: string,
): ShellEmission[] {
  const emissions: ShellEmission[] = [];

  // Environment variables (hoisted)
  for (const envVar of content.environmentVariables) {
    // Parse "export VAR=value" format
    const parsed = parseEnvironmentVariable(envVar);
    if (parsed) {
      emissions.push(environment({ [parsed.name]: parsed.value }));
    }
  }

  // Path modifications (hoisted)
  for (const pathMod of content.pathModifications) {
    const pathValue = parsePathModification(pathMod);
    if (pathValue) {
      emissions.push(path(pathValue, 'prepend'));
    }
  }

  // Aliases (non-hoisted)
  for (const aliasStr of content.toolInit) {
    const parsed = parseAlias(aliasStr);
    if (parsed) {
      emissions.push(alias(parsed.name, parsed.value));
    }
  }

  // Functions (non-hoisted)
  for (const func of content.functions) {
    emissions.push(fn(func.name, func.body, { needsHomeOverride: true }));
    if (func.source) {
      emissions.push(sourceFunction(func.name));
    }
  }

  // Scripts
  for (const shellScript of [...content.alwaysScripts, ...content.onceScripts, ...content.rawScripts]) {
    if (isAlwaysScript(shellScript)) {
      emissions.push(script(shellScript.value, { timing: 'always', needsHomeOverride: true }));
    } else if (isOnceScript(shellScript)) {
      emissions.push(script(shellScript.value, { timing: 'once', identifier: toolName }));
    } else if (isRawScript(shellScript)) {
      emissions.push(script(shellScript.value, { timing: 'raw' }));
    }
  }

  // Completions (hoisted)
  for (const comp of content.completionSetup) {
    emissions.push(completion(comp.command, comp.completionSource));
  }

  return emissions;
}

// Helper functions for parsing existing string formats
function parseEnvironmentVariable(str: string): { name: string; value: string; } | null {
  const match = str.match(/^export\s+(\w+)=["']?(.*)["']?$/);
  return match ? { name: match[1], value: match[2] } : null;
}

function parsePathModification(str: string): string | null {
  const match = str.match(/^export\s+PATH=["']?([^:]+):\$PATH["']?$/);
  return match ? match[1] : null;
}

function parseAlias(str: string): { name: string; value: string; } | null {
  const match = str.match(/^alias\s+(\w+)=["'](.*)["']$/);
  return match ? { name: match[1], value: match[2] } : null;
}
```

#### 2. `adapters/index.ts`

```typescript
export { adaptShellInitContentToEmissions } from './EmissionAdapter';
```

### Modification to Existing Files

#### `shell-generators/BaseShellGenerator.ts`

Add dual-path capability:

```typescript
// Add import
import { BlockBuilder, BlockRenderer } from '@dotfiles/shell-emissions';
import { createEmissionFormatter } from '../formatters';
import { adaptShellInitContentToEmissions } from '../adapters';

// Add new method alongside existing generateFileContent()
protected generateFileContentV2(
  toolConfigs: ToolConfig[],
  shellType: ShellType
): string {
  // 1. Convert each tool's IShellInitContent to emissions
  const allEmissions: Array<{ toolName: string; emissions: ShellEmission[] }> = [];
  
  for (const config of toolConfigs) {
    const content = this.extractShellContent(config);
    const emissions = adaptShellInitContentToEmissions(content, config.name);
    allEmissions.push({ toolName: config.name, emissions });
  }

  // 2. Build blocks using BlockBuilder
  const blockBuilder = new BlockBuilder();
  for (const { toolName, emissions } of allEmissions) {
    blockBuilder.addTool(toolName, emissions);
  }
  const blocks = blockBuilder.build();

  // 3. Render using BlockRenderer with shell-specific formatter
  const formatter = createEmissionFormatter(shellType, this.formatterConfig);
  const renderer = new BlockRenderer(formatter);
  return renderer.render(blocks);
}
```

### Dependencies

- Phase 1 must be complete (formatters available)

### Testing Requirements

- Unit tests for adapter parsing functions
- Integration tests comparing `generateFileContent()` vs `generateFileContentV2()` output
- Property-based tests for round-trip conversion

---

## Phase 3: Generator Integration

### Objective

Replace the current generation flow with the new emissions-based approach.

### Files to Modify

#### 1. `shell-generators/BaseShellGenerator.ts`

**Before:**

```typescript
public generate(toolConfigs: ToolConfig[]): string {
  return this.generateFileContent(toolConfigs);
}
```

**After:**

```typescript
public generate(toolConfigs: ToolConfig[]): string {
  // Use new emissions-based generation
  return this.generateFileContentV2(toolConfigs, this.shellType);
}

// Keep old method as deprecated fallback
/** @deprecated Use generateFileContentV2 */
protected generateFileContent(toolConfigs: ToolConfig[]): string {
  // ... existing implementation unchanged
}
```

#### 2. `shell-generators/ZshGenerator.ts`

**Changes:**

- Remove `IShellStringProducer` dependency
- Use `ZshEmissionFormatter` instead
- Update constructor to create formatter

```typescript
export class ZshGenerator extends BaseShellGenerator {
  constructor(config: GeneratorConfig) {
    super('zsh', config);
  }

  // Remove: protected readonly stringProducer: ZshStringProducer
  // Formatter is created on-demand in generateFileContentV2()
}
```

#### 3. `shell-generators/BashGenerator.ts`

Same pattern as `ZshGenerator`.

#### 4. `shell-generators/PowerShellGenerator.ts`

Same pattern as `ZshGenerator`.

#### 5. `IShellGenerator.ts`

Update interface to reflect new architecture:

```typescript
export interface IShellGenerator {
  readonly shellType: ShellType;
  generate(toolConfigs: ToolConfig[]): string;

  // Remove shell-specific producer methods
  // These are now encapsulated in IEmissionFormatter
}
```

#### 6. `IShellInitContent.ts`

Mark as deprecated:

```typescript
/**
 * @deprecated Use ShellEmission[] from @dotfiles/shell-emissions instead.
 * This interface is maintained for backward compatibility during migration.
 */
export interface IShellInitContent {
  // ... existing fields
}
```

### Files to Remove/Deprecate

The following files should be marked `@deprecated` but NOT deleted yet:

- `string-producers/ZshStringProducer.ts`
- `string-producers/BashStringProducer.ts`
- `string-producers/PowerShellStringProducer.ts`
- `string-producers/IShellStringProducer.ts`
- `script-formatters/AlwaysScriptFormatter.ts`
- `script-formatters/OnceScriptFormatter.ts`
- `script-formatters/FunctionScriptFormatter.ts`
- `script-formatters/IScriptFormatter.ts`

### Dependencies

- Phase 1 and Phase 2 must be complete
- All formatters tested and verified

### Testing Requirements

- Full integration tests with test-project
- Regression tests ensuring identical output (where semantically equivalent)
- Snapshot updates for any intentional output changes

---

## Phase 4: Deprecation and Cleanup

### Objective

Remove deprecated code and finalize the migration.

### Files to Delete

After migration is stable (confirmed working in production):

```
shell-init-generator/src/
├── string-producers/           # DELETE entire directory
│   ├── ZshStringProducer.ts
│   ├── BashStringProducer.ts
│   ├── PowerShellStringProducer.ts
│   └── IShellStringProducer.ts
├── script-formatters/          # DELETE entire directory
│   ├── AlwaysScriptFormatter.ts
│   ├── OnceScriptFormatter.ts
│   ├── FunctionScriptFormatter.ts
│   └── IScriptFormatter.ts
└── adapters/                   # DELETE after Phase 5 (direct emission)
    └── EmissionAdapter.ts
```

### Files to Modify

#### 1. Remove deprecated code from `BaseShellGenerator.ts`

Delete:

- `generateFileContent()` (old method)
- `collectHoistedContent()`
- `generateToolSection()`
- `generateHoistedSection()`
- All references to `IShellStringProducer`
- All references to `*ScriptFormatter`

Rename:

- `generateFileContentV2()` → `generateFileContent()`

#### 2. Clean up types in `IShellInitContent.ts`

Either:

- Delete file entirely if no longer used
- Or keep as internal type if adapter is still needed

#### 3. Update `index.ts` exports

Remove exports for deleted modules.

### Package.json Updates

Remove any dependencies only used by deleted code.

### Testing Requirements

- Verify all tests pass after deletion
- Verify no runtime errors in test-project
- Verify shell init files are generated correctly

---

## Risk Areas and Mitigations

### Risk 1: Output Differences

**Risk:** New emission system produces slightly different output than current system.

**Mitigation:**

- Use snapshot tests to detect any output changes
- Review all differences for semantic equivalence
- Document intentional improvements vs regressions

### Risk 2: HOME Override Logic

**Risk:** HOME override is complex and easy to break. Currently handled in multiple places.

**Mitigation:**

- Consolidate HOME override in formatter's `formatFunction()` and `formatScript()` methods
- Use `needsHomeOverride` flag consistently
- Create dedicated tests for HOME override scenarios

### Risk 3: Once Script File Paths

**Risk:** Once scripts write to `.once/` directory. Path generation must be consistent.

**Mitigation:**

- Pass `FormatterConfig.oncePath` to formatter
- Use same path generation logic as current `OnceScriptFormatter`
- Integration tests verifying once script file creation

### Risk 4: Completion Syntax Differences

**Risk:** Completion setup varies significantly between shells.

**Mitigation:**

- Extract all completion logic from `CompletionGenerator` and `*StringProducer`
- Test each shell's completion syntax independently
- Verify completions work in actual shell environments

### Risk 5: PowerShell Edge Cases

**Risk:** PowerShell has significantly different syntax and may have untested code paths.

**Mitigation:**

- Prioritize PowerShell formatter testing
- Create PowerShell-specific integration tests
- Consider PowerShell expert review

### Risk 6: Backward Compatibility

**Risk:** External code may depend on `IShellInitContent` structure.

**Mitigation:**

- Keep `IShellInitContent` deprecated but functional during Phase 3
- Provide migration guide for external consumers
- Consider semver major version bump

---

## Testing Strategy

### Unit Tests (Per Phase)

#### Phase 1 Tests

```
formatters/__tests__/
├── ZshEmissionFormatter.test.ts
│   ├── formatEnvironment()
│   ├── formatPath()
│   ├── formatAlias()
│   ├── formatFunction() with HOME override
│   ├── formatScript() timing variants
│   ├── formatOnceScript()
│   ├── formatSourceFile()
│   ├── formatSourceFunction()
│   ├── formatCompletion()
│   └── header/footer formatting
├── BashEmissionFormatter.test.ts
│   └── (same structure as Zsh)
├── PowerShellEmissionFormatter.test.ts
│   └── (same structure with PowerShell-specific assertions)
└── EmissionFormatterFactory.test.ts
    └── creates correct formatter for each shell type
```

#### Phase 2 Tests

```
adapters/__tests__/
└── EmissionAdapter.test.ts
    ├── parseEnvironmentVariable()
    ├── parsePathModification()
    ├── parseAlias()
    ├── adaptShellInitContentToEmissions() full conversion
    └── handles edge cases (empty arrays, missing fields)
```

#### Phase 3 Tests

```
shell-generators/__tests__/
├── BaseShellGenerator.test.ts
│   └── generateFileContentV2() matches expected output
├── ZshGenerator.test.ts
│   └── integration with ZshEmissionFormatter
├── BashGenerator.test.ts
│   └── integration with BashEmissionFormatter
└── PowerShellGenerator.test.ts
    └── integration with PowerShellEmissionFormatter
```

### Integration Tests

```
__tests__/integration/
├── full-generation.test.ts
│   ├── generates valid zsh init file
│   ├── generates valid bash init file
│   └── generates valid powershell init file
├── hoisting.test.ts
│   ├── environment variables hoisted correctly
│   ├── path modifications hoisted correctly
│   └── completions hoisted correctly
└── once-scripts.test.ts
    ├── once script files created in correct location
    └── once script initializer loop generated correctly
```

### Regression Tests

For each phase, add regression tests that compare:

```typescript
it('produces equivalent output to legacy system', () => {
  const legacyOutput = legacyGenerator.generateFileContent(toolConfigs);
  const newOutput = newGenerator.generate(toolConfigs);

  // Normalize whitespace for comparison
  expect(normalize(newOutput)).toEqual(normalize(legacyOutput));
});
```

### Snapshot Requirements

All test output must use `toMatchInlineSnapshot()` per project testing requirements.

### Coverage Requirements

- 90% branch coverage for new formatter code
- 85% coverage for adapter code
- All error paths tested

---

## Rollback Considerations

### Phase-Level Rollback

Each phase is designed to be independently rollable:

#### Phase 1 Rollback

- Simply don't use new formatters
- No changes to existing code paths

#### Phase 2 Rollback

- Remove adapter imports
- No changes to `generateFileContent()` usage

#### Phase 3 Rollback

- Change `generate()` to call `generateFileContent()` instead of `generateFileContentV2()`
- Single line change

```typescript
public generate(toolConfigs: ToolConfig[]): string {
  // ROLLBACK: return this.generateFileContentV2(toolConfigs, this.shellType);
  return this.generateFileContent(toolConfigs);
}
```

#### Phase 4 Rollback

- Restore deleted files from git history
- Re-add exports to `index.ts`
- Rollback to Phase 3 state

### Feature Flag Option

For gradual rollout, consider adding a feature flag:

```typescript
public generate(toolConfigs: ToolConfig[]): string {
  if (this.config.useEmissions) {
    return this.generateFileContentV2(toolConfigs, this.shellType);
  }
  return this.generateFileContent(toolConfigs);
}
```

### Version Strategy

- Phase 1-2: Minor version bump (new features, no breaking changes)
- Phase 3: Minor version bump (new features, old code deprecated but functional)
- Phase 4: Major version bump (breaking changes, old code removed)

---

## Appendix: File Change Summary

### New Files (12 total)

| File                                                       | Phase | Purpose                                   |
| ---------------------------------------------------------- | ----- | ----------------------------------------- |
| `formatters/ZshEmissionFormatter.ts`                       | 1     | Zsh-specific emission formatting          |
| `formatters/BashEmissionFormatter.ts`                      | 1     | Bash-specific emission formatting         |
| `formatters/PowerShellEmissionFormatter.ts`                | 1     | PowerShell-specific emission formatting   |
| `formatters/EmissionFormatterFactory.ts`                   | 1     | Factory for creating formatters           |
| `formatters/index.ts`                                      | 1     | Barrel export                             |
| `adapters/EmissionAdapter.ts`                              | 2     | IShellInitContent → Emission[] conversion |
| `adapters/index.ts`                                        | 2     | Barrel export                             |
| `formatters/__tests__/ZshEmissionFormatter.test.ts`        | 1     | Unit tests                                |
| `formatters/__tests__/BashEmissionFormatter.test.ts`       | 1     | Unit tests                                |
| `formatters/__tests__/PowerShellEmissionFormatter.test.ts` | 1     | Unit tests                                |
| `adapters/__tests__/EmissionAdapter.test.ts`               | 2     | Unit tests                                |
| `__tests__/integration/full-generation.test.ts`            | 3     | Integration tests                         |

### Modified Files (7 total)

| File                                      | Phase | Changes                                                   |
| ----------------------------------------- | ----- | --------------------------------------------------------- |
| `package.json`                            | 1     | Add `@dotfiles/shell-emissions` dependency                |
| `shell-generators/BaseShellGenerator.ts`  | 2,3,4 | Add `generateFileContentV2()`, then migrate, then cleanup |
| `shell-generators/ZshGenerator.ts`        | 3     | Remove StringProducer dependency                          |
| `shell-generators/BashGenerator.ts`       | 3     | Remove StringProducer dependency                          |
| `shell-generators/PowerShellGenerator.ts` | 3     | Remove StringProducer dependency                          |
| `IShellGenerator.ts`                      | 3     | Update interface                                          |
| `index.ts`                                | 3,4   | Update exports                                            |

### Deprecated Files (8 total - Phase 3)

| File                                           | Phase | Status     |
| ---------------------------------------------- | ----- | ---------- |
| `string-producers/ZshStringProducer.ts`        | 3     | Deprecated |
| `string-producers/BashStringProducer.ts`       | 3     | Deprecated |
| `string-producers/PowerShellStringProducer.ts` | 3     | Deprecated |
| `string-producers/IShellStringProducer.ts`     | 3     | Deprecated |
| `script-formatters/AlwaysScriptFormatter.ts`   | 3     | Deprecated |
| `script-formatters/OnceScriptFormatter.ts`     | 3     | Deprecated |
| `script-formatters/FunctionScriptFormatter.ts` | 3     | Deprecated |
| `script-formatters/IScriptFormatter.ts`        | 3     | Deprecated |

### Deleted Files (8+ total - Phase 4)

All files marked deprecated in Phase 3, plus:

- `adapters/EmissionAdapter.ts` (after direct emission support)
- Potentially `IShellInitContent.ts` if no longer needed

---

## Appendix: Emission Type Reference

Quick reference for all emission types from `@dotfiles/shell-emissions`:

```typescript
// Factory functions and their output types
environment({ VAR: 'value' })     → EnvironmentEmission (hoisted)
path('/bin/path', 'prepend')      → PathEmission (hoisted)
alias('name', 'value')            → AliasEmission
fn('name', 'body', opts)          → FunctionEmission
script('code', opts)              → ScriptEmission (timing: 'always'|'once'|'raw')
sourceFile('/path')               → SourceFileEmission
sourceFunction('fnName')          → SourceFunctionEmission
completion('cmd', 'source')       → CompletionEmission (hoisted)
```

---

## Appendix: Block Structure Reference

Default block structure from `BlockBuilder`:

```
FileHeader (priority: 0)
├── Path Section (priority: 100) - hoisted PathEmissions
├── Environment Section (priority: 200) - hoisted EnvironmentEmissions
├── MainContent Section (priority: 300)
│   ├── Tool: tool-name-1
│   │   └── [non-hoisted emissions]
│   └── Tool: tool-name-2
│       └── [non-hoisted emissions]
├── OnceScripts Section (priority: 400) - once script initializer
├── Completions Section (priority: 500) - hoisted CompletionEmissions
└── FileFooter (priority: 999)
```
