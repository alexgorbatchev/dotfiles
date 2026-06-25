---
created_on: 2026-06-25 10:15
last_modified: 2026-06-25 10:15
status: current
ticket_status: open
---

# Wave 6: Modernize Binary Size Limit and Verification

## Problem

In `packages/build/src/build/steps/enforceCliBundleSizeLimit.ts`, the build pipeline verifies that the generated `cli.js` file does not exceed a strict bundle size budget (typically under 500KB).

As we shift the runtime engine from Bun-bundled JavaScript to a statically compiled Go executable, the output executable will naturally be much larger (ranging between 15MB to 25MB). This size increase is due to compiling the Go standard libraries, embedding the **Sobek JS VM**, using the **CGO-free SQLite driver**, and bundling the React **dashboard client assets**. The current size verification step will crash the compilation process immediately once a Go binary is built.

## Why this matters

We must maintain a strict guardrail in the compilation process to prevent accidental bloat (such as embedding unneeded source files, uncompressed assets, or massive libraries), while adjusting the threshold to reflect our new statically-linked compiled Go engine. Updating this step keeps our CI/CD pipelines green and reliable.

## Observed context

- Checked file path: `packages/build/src/build/steps/enforceCliBundleSizeLimit.ts`
- Size threshold values are located within `packages/build/src/build/types.ts` and the build context helpers.
- The compiled Go executable location: `.dist/dotfiles`.

## Desired outcome

The bundle size check is refactored into a Go binary size validator. It checks the final statically compiled executable file size at `.dist/dotfiles` and enforces a strict but realistic budget (e.g. 25MB max), raising clear alerts if the executable grows beyond this limit.

## Acceptance criteria

- [ ] Rename the build step file `packages/build/src/build/steps/enforceCliBundleSizeLimit.ts` to `packages/build/src/build/steps/enforceGoBinarySizeLimit.ts`, and rename its exported function to `enforceGoBinarySizeLimit`.
- [ ] Update `packages/build/src/build/build.ts` to import and invoke `enforceGoBinarySizeLimit` instead of the legacy `enforceCliBundleSizeLimit`.
- [ ] Rename the config property `maxCliBundleSizeBytes` to `maxGoBinarySizeBytes` in `packages/build/src/build/types.ts` and set its exact value inside the build context to `26214400` bytes (representing exactly 25MB).
- [ ] In `enforceGoBinarySizeLimit`, check if the file `.dist/dotfiles` exists; if it does not, throw `BuildError("dotfiles output is missing")`.
- [ ] Compare the `.dist/dotfiles` file size with `maxGoBinarySizeBytes`. If it exceeds the threshold, throw a `BuildError` with the exact message template:
      `dotfiles binary is too large (${sizeKb} kb), expected under 25600 kb`
- [ ] Create unit tests inside `packages/build/src/build/__tests__/enforceGoBinarySizeLimit.test.ts` that verify both the passing case (mocking a file under 25MB) and the throwing case (mocking a file over 25MB, asserting the exact BuildError message structure).
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
