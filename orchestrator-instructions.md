# Directive for Orchestration Agent: Autonomous Bottom-Up Migration Management

You are the **Orchestrator Agent** responsible for driving the total, autonomous migration of the repository from TypeScript (`packages/*`) to Go (`pkg/*`, `cmd/*`, `scripts/*`).

Your core goal is:

**"Orchestrate bottom-up, wave-based package parity repairs until all TypeScript packages can be demolished and the Go binary distribution is 100% functionally and semantically identical."**

---

## 📐 Topological Wave Hierarchy

To prevent race conditions and cross-package compile errors, you MUST process packages in strict **Topological Wave Order** from leaf packages to top-level orchestration. Within a single wave, all package audits and repairs can run concurrently.

```
Wave 1: Leaf Utilities (No internal package dependencies)
Wave 2: Core I/O, Database & Services (Depends on Wave 1)
Wave 3: Installers, Environment, Features & Shell Emissions (Depends on Waves 1–2)
Wave 4: Top-Level Orchestration, CLI & Build Pipeline (Depends on Waves 1–3)
```

### Wave 1: Leaf Utilities
- `pkg/utils` vs `packages/utils`
- `pkg/exec` vs `packages/cli` (exec utilities)
- `pkg/fs` vs `packages/file-system`
- `pkg/logger` vs `packages/logger`
- `pkg/version` vs `packages/version-checker`
- `pkg/arch` vs `packages/arch`
- `pkg/unwrap` vs `packages/unwrap-value`

### Wave 2: Core I/O, Database & Services
- `pkg/db` vs `packages/registry-database`
- `pkg/downloader` vs `packages/downloader`
- `pkg/archive` vs `packages/archive-extractor`
- `pkg/proxy` vs `packages/http-proxy`
- `pkg/config` vs `packages/config`

### Wave 3: Installers, Environment, Features & Shell Emissions
- `pkg/installer/` (15 plugins: `apt`, `brew`, `cargo`, `curl-binary`, `curl-script`, `curl-tar`, `dmg`, `dnf`, `gitea`, `github`, `manual`, `npm`, `pacman`, `pkg`, `zsh-plugin`) vs `packages/installer-*`
- `pkg/registry` vs `packages/registry`
- `pkg/features` vs `packages/features`
- `pkg/shell` vs `packages/shell-emissions`
- `pkg/shim` vs `packages/shim-generator`
- `pkg/symlink` vs `packages/symlink-generator`
- `pkg/venv` vs `packages/virtual-env`

### Wave 4: Top-Level Orchestration, CLI & Build Pipeline
- `pkg/orchestrator` vs `packages/generator-orchestrator`
- `pkg/shellinit` vs `packages/shell-init-generator`
- `pkg/vm` vs `packages/core` & `packages/tool-config-builder`
- `pkg/dashboard` vs `packages/dashboard`
- `cmd/dotfiles` vs `packages/cli`
- `scripts/build`, `scripts/typegen`, `scripts/managed-installer` vs `packages/build`

*Note on TypeScript workspace state*: Earlier waves may have already deleted or relocated legacy TypeScript packages in `packages/*`. For completed packages, inspect TypeScript reference code via git history/tags if needed. Active TypeScript reference code resides in `packages/dashboard` and git tags.

---

## 🤖 Orchestration Protocol

Sub-agent communication is **parent-mediated**. The Worker agent completes its repair and returns its output to you (the Orchestrator). You then pass the Worker's output to the Reviewer sub-agent for an independent audit.

For each Wave $N$ (starting at Wave 1):

### Step 1: Dispatch Worker Sub-Agent
For each package target `<package_path>` in Wave $N$ (e.g. `pkg/fs`, `cmd/dotfiles`, `scripts/build`):
1. Launch a **Worker Sub-Agent** instructed via `./worker-package-instructions.md`.
2. Provide the Worker with:
   - Target package path: `<package_path>`
   - TypeScript reference package: `packages/<name>` (or git history reference)
   - Current Attempt Turn: `Turn 1 of 3`

### Step 2: Dispatch Reviewer Sub-Agent upon Worker Completion
When the Worker completes its task and returns its parity report:
1. Launch a **Reviewer Sub-Agent** instructed via `./reviewer-package-instructions.md`.
2. Provide the Reviewer with:
   - Target package path: `<package_path>`
   - TypeScript reference package: `packages/<name>`
   - Worker's diff summary and parity report
   - Current Attempt Turn: `Turn X of 3`

### Step 3: Handle Reviewer Verdict & Iteration Loop
- If Reviewer returns **`APPROVED`**: Mark package as verified.
- If Reviewer returns **`REJECTED`**:
  - If attempt turn $< 3$: Re-dispatch Worker with the Reviewer's feedback, incrementing turn count (`Turn X+1 of 3`).
  - If attempt turn $= 3$: Intervene as Orchestrator to resolve remaining gaps or adjust strategy.

### Step 4: Wave Gate & Global Verification
Once ALL package targets in Wave $N$ receive `APPROVED` status from their Reviewers:
1. Execute wave verification command: `go test -count=1 ./...`.
2. Verify that all Wave $N$ packages pass unit and integration tests cleanly.
3. Advance to Wave $N+1$.

### Step 5: Final Demolition Verification (After Wave 4)
When Wave 4 achieves full `APPROVED` status across all top-level packages:
1. Run binary builds and type generation:
   ```bash
   go run scripts/typegen/main.go
   go run scripts/build/main.go
   ```
2. Run full verification suite: `bun check`.
3. Confirm Go CLI binary builds and runs cleanly against fixture projects (`go run ./cmd/dotfiles --config test-project-npm/dotfiles.config.ts generate`).
4. Generate final completion summary.
