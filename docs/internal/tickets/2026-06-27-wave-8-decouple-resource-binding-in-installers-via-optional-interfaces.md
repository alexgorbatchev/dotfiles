---
created_on: 2026-06-27 11:00
last_modified: 2026-06-27 11:00
status: current
ticket_status: open
---

# Wave 8: Decouple Resource Binding in Installers via Optional Interfaces

## Problem

Inside `pkg/installer/installer.go`, the orchestrator binds tracked filesystems (`SetFS`) and loggers (`SetLogger`) to installer structs via type switches. This creates a tight coupling and requires manual maintenance of these lists every time a new installer plugin is introduced.

## Why this matters

Tight coupling makes the plugin system brittle and hard to extend. Every time a new installer plugin is added, developer overhead rises because they must remember to update `installer.go`'s switches, or resource injection will fail. Transitioning to duck-typed optional interfaces is a standard, idiomatic Go practice that achieves automatic, loose coupling of these resources.

## Observed context

- Go files:
  - `pkg/installer/installer.go` (contains `SetFS` and `SetLogger` switches)

## Desired outcome

Installers receive their filesystem and logger resources polymorphically. The orchestrator checks if a registered installer implements optional `SetFS` or `SetLogger` interfaces, injecting the resources automatically without any hardcoded switch statements.

## Acceptance criteria

- [ ] **Define Optional Interfaces:** Define `interface { SetFS(fs.FS) }` and `interface { SetLogger(*logger.Logger) }` interfaces inside `pkg/installer/installer.go`.
- [ ] **Polymorphic Injection:** Refactor `SetFS` and `SetLogger` in `installer.go` to perform type assertions on these interfaces instead of concrete type switches.
- [ ] **Plugin Alignment:** Implement these interface methods on any installer structures that require them (e.g., `CargoInstaller`, `GitHubInstaller`, `AptInstaller`, etc.).
- [ ] **Unit Testing:** Verify with existing installer tests that they still receive their loggers and filesystems correctly after the refactoring.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
