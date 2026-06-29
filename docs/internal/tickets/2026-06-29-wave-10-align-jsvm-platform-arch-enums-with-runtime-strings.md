---
created_on: 2026-06-29 09:00
last_modified: 2026-06-29 09:00
status: current
ticket_status: open
---

# Wave 10: Align JSVM Platform and Arch Enums with Runtime Strings

## Problem

In the public TypeScript DSL (`dsl-types.ts`), the environment metadata inside `systemInfo` is specified using strict type enums:
```typescript
export interface ISystemInfoInternal {
  platform: Platform; // Enum: None=0, Linux=1, MacOS=2...
  arch: Architecture; // Enum: None=0, X86_64=1, Arm64=2...
}
```

However, Goja's VM runtime context (`pkg/vm/loader-api.ts` / `bindings.go`) injects the system info utilizing flat string values derived from OS and Arch names (e.g., `"darwin"`, `"linux"`, `"amd64"`):
```typescript
export interface ISystemInfo {
  os: string;
  arch: string;
  libc: string;
}
```

**The DX Bug:** Any user-authored `.tool.ts` configuration script that uses standard platform/architecture checks (e.g., `if (ctx.systemInfo.platform === Platform.MacOS)`) will fail silently and always evaluate to `false` because the injected object is completely missing the `platform` property.

## Why this matters

Writing platform-specific installations is one of the most common requirements in dotfiles. Since the runtime lacks the `Platform` and `Architecture` enums, configurations designed for macOS or Linux will either silently skip installation or evaluate incorrect parameters, leading to broken setups.

## Observed context

- Go files:
  - `pkg/vm/bindings.go` (injects raw system info maps to the Javascript context)
  - `pkg/vm/loader-api.ts` (exposes injected system info bindings)
  - `pkg/vm/dsl-types.ts` (defines public `Platform` and `Architecture` enums)

## Desired outcome

The system info object injected into the Javascript runtime context matches the public TypeScript DSL specification, exporting both string properties and numerical/enum-based properties (`platform` and `arch`) aligned with `Platform` and `Architecture` enums.

## Acceptance criteria

- [ ] **Define Enums in loader-api.ts**: Export standard `Platform` and `Architecture` enums inside `pkg/vm/loader-api.ts` and `dsl-types.ts` with matching numeric mappings.
- [ ] **Expose Enums on Context**: Ensure Goja maps numeric/enum equivalents for OS and Arch when preparing the system info payload.
  - Mapping examples:
    - OS `"darwin"` -> `Platform.MacOS` (2)
    - OS `"linux"` -> `Platform.Linux` (1)
    - Arch `"amd64"` -> `Architecture.X86_64` (1)
    - Arch `"arm64"` -> `Architecture.Arm64` (2)
- [ ] **Expose Both Interfaces**: Keep `os` and `arch` strings for backward compatibility but ensure `platform` and `arch` enums are fully populated and compared cleanly.
- [ ] **Unit testing**: Add unit tests in `pkg/vm/loader_test.go` verifying that a Javascript block containing `if (ctx.systemInfo.platform === Platform.MacOS)` evaluates correctly on macOS and is fully type-safe.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
