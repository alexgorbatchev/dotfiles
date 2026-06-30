---
created_on: 2026-06-29 09:00
last_modified: 2026-06-29 09:00
status: current
ticket_status: open
---

# Wave 10: Resolve JSVM Filesystem Async and Write API Mismatch

## Problem

In the public TypeScript DSL declaration files (`dsl-types.ts`), the virtual filesystem interface (`IFileSystem`) passed to tool configurations and hooks specifies asynchronous, promise-returning methods:

```typescript
export interface IFileSystem {
  readFile(path: string, encoding?: string): Promise<string>;
  exists(path: string): Promise<boolean>;
  readdir(path: string): Promise<string[]>;
  writeFile(path: string, content: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  rm(path: string): Promise<void>;
}
```

However, Goja's native binding pool (`pkg/vm/bindings.go`) registers synchronous, primitive-returning bindings for the filesystem (such as `fileExists`, `fsReadDir`, and `fsReadFile` in `RegisterContextBindings`). More critically, **write operations (`writeFile`, `mkdir`, and `rm`) are completely missing from Goja's native bindings and loader-api context!**

If any user-authored `.tool.ts` configuration attempts to write, make directories, or remove files via `ctx.fs.writeFile`, the VM instantly crashes at runtime with:
`TypeError: undefined is not a function`

## Why this matters

The virtual filesystem sandbox is a key mechanism for writing secure, non-destructive configurations. By leaving the mutation APIs completely unimplemented and presenting an async vs. sync API boundary mismatch, any tool configuration that performs local setup operations or file customization will fail on Go, breaking complete drop-in parity.

## Observed context

- Go files:
  - `pkg/vm/bindings.go` (contains JS bindings registered on the Goja runtime context)
  - `pkg/vm/loader-api.ts` (defines Javascript side wrapper bindings injected into Goja)
  - `pkg/vm/dsl-types.ts` (defines public typescript types)

## Desired outcome

Goja's native bindings and `loader-api.ts` wrappers are fully aligned with the asynchronous `IFileSystem` interface defined in `dsl-types.ts`, implementing full support for `writeFile`, `mkdir`, and `rm` routed securely through the active sandboxed `fsys` abstraction.

## Acceptance criteria

- [ ] **Implement Write FS Bindings**: Implement `fsWriteFile`, `fsMkdir`, and `fsRm` inside `pkg/vm/bindings.go` delegating safely to the virtual `fsys` instance.
- [ ] **Map Bindings in loader-api.ts**: Wrap these native bindings in `pkg/vm/loader-api.ts` and export them via the injected `fs` context.
- [ ] **Align Async Signatures**: Ensure that `loader-api.ts` presents asynchronous promise wrappers (returning `Promise.resolve()` or wrapping the synchronous Goja primitive returns in promises) to conform to the public `IFileSystem` types and prevent compiler and editor errors.
- [ ] **Add Unit Tests**: Write unit tests inside `pkg/vm/loader_test.go` verifying that a Javascript block using `await ctx.fs.writeFile("test.txt", "content")`, `await ctx.fs.mkdir("dir")`, and `await ctx.fs.rm("test.txt")` executes successfully inside the Sobek VM and modifies the virtual filesystem.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
