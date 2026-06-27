---
created_on: 2026-06-26 17:00
last_modified: 2026-06-27 09:31
status: current
ticket_status: closed
---

# Wave 7: Implement Interactive Terminal Progress Bar for Go Downloader

## Problem

The legacy TS engine features a beautiful, real-time interactive terminal progress bar (`ProgressBar.ts` and `renderProgressFrame.ts`) that writes to stderr. It includes ANSI carriage-return escape sequences, ETA countdowns, speed calculations, and clean cursor hiding/showing to prevent terminal flickering. It also automatically suppresses output in non-TTY pipelines or CI/CD systems.

Go's downloader (`pkg/downloader/downloader.go`) defines an `OnProgress` function hook inside its options but **implements zero visual terminal UI**. When Go downloads large tools, the terminal remains completely static, giving the user a false impression of a frozen or hung execution.

## Why this matters

User experience (UX) is crucial. Silent downloads during installation processes can frustrate users and lead to premature execution terminations. A clean, non-flickering, real-time progress bar is a required feature of a high-quality CLI tool.

## Observed context

- Go downloader:
  - `pkg/downloader/downloader.go` (defines downloader and progress stream tracking)
- TS visual progress bar:
  - `.workspaces/main/packages/downloader/src/ProgressBar.ts`
  - `.workspaces/main/packages/downloader/src/renderProgressFrame.ts`

## Desired outcome

Go's downloader implements a terminal-interactive progress bar drawing real-time percentage indicators, transfer speeds, and ETA counts to stderr when running in a terminal environment (TTY).

## Acceptance criteria

- [x] **Progress Bar UI**: Implement a terminal progress bar in Go (or leverage a robust standard library/package if preferred) that formats the percentage completion.
- [x] **Speed & ETA Formatters**: Compute and render the download transfer speed (e.g., `1.5 MB/s`) and estimated time of arrival (ETA) (e.g., `| 12s left`).
- [x] **ANSI Terminal Controls**: Hide the cursor during downloads and restore it on finish/abort. Use ANSI carriage return (`\r`) to overwrite the active line without scrolling.
- [x] **TTY & CI/CD Protection**: Only draw the progress bar if the output stream (stderr) is a real TTY and not running inside CI/CD pipelines or quiet mode.
- [x] **Unit Testing**: Add tests in `pkg/downloader/downloader_test.go` verifying the correct calculation of speeds and ETA strings under simulated progress.
- [x] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
