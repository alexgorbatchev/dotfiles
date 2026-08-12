# Directive for Conducting a Holistic Migration and Parity Audit

You are tasked with conducting an extremely rigorous, line-by-line, and highly skeptical audit of the entire repository to answer the ultimate core question of this migration:

**"Can we delete the TypeScript implementation and ship the Go CLI to users today without breaking anything?"**

Write your final findings and analysis as a comprehensive **Migration and Parity Gap Report** directly to `./gaps-report.md`.

---

## 🎯 Audit Philosophy: No Blinders, No Compromises (Zero-Tolerance for Satisficing)

Previous agents have repeatedly suffered from **local-scope bias**—they looked only at individual tickets, saw green unit tests, and over-confidently declared "100% parity." You must avoid this failure mode. A green test suite or compile-time interface match is a deceptive indicator of parity.

You must act as a severe skeptic:

1. **Compulsory Side-by-Side Reading**: You and your sub-agents MUST physically call the Read tool on BOTH the Go source file and the corresponding TypeScript source file for every single component. Do not summarize, use grep keywords, or scan file headers as a shortcut. Read both files in full.
2. **Audit the "Negative Space"**: Look for the silent, non-textual differences. Go and TypeScript runtimes have fundamentally different behaviors. You must audit the following specific semantic divergences:
   - **Order Non-Determinism**: Go maps have randomized iteration order by design, whereas JS preserves insertion order. Audit how directories or maps are returned.
   - **Standard Library Defaults**: Go's default `http.Client` has an infinite timeout, risking locked processes. Audit all request timeouts and user-agent setups.
   - **Path Resolution**: Shells and Node/Bun automatically resolve tilde shortcuts (`~` and `~/`), while Go's `os` and `filepath` packages treat `~` as a literal directory name. Audit all path parameters.
   - **Symlink and Link Handling**: Check if hard links, symlinks, or broken links are processed identically, particularly inside virtual filesystems (`MemFS`) and archive extractors.
   - **Subprocess Stability**: Audit what happens on early error paths. Do subprocesses (e.g. `xz` decompression pipelines) leak or hang as zombies?
3. **No Shortcuts on Multi-Installers**: If a package contains multiple installer plugins (e.g. 15 package installers in `pkg/installer`), you must perform the side-by-side comparison for all of them. Never assume that since one installer works, the others share identical characteristics.

---

## 🤖 Multi-Agent Dispatching and Aggregation Protocol

To maximize thoroughness, performance, and depth of analysis, you **must not** conduct this audit alone. You must act as the **Orchestration Agent** and delegate specialized package-level audits to parallel sub-agents, and then synthesize their findings into the final report.

### Step 1: Map Every Individual Go Package to its TypeScript Predecessor

Map every Go package (`pkg/*`, `cmd/*`, `scripts/*`) directly to its corresponding TypeScript workspace package (`packages/*`):

1. **Core Storage & FS Packages:**
   - `pkg/fs/` vs `packages/file-system/`
   - `pkg/db/` vs `packages/registry-database/`
   - `pkg/registry/` vs `packages/registry/`
2. **Orchestration & Shell Packages:**
   - `pkg/orchestrator/` vs `packages/generator-orchestrator/`
   - `pkg/shellinit/` vs `packages/shell-init-generator/`
   - `pkg/shell/` vs `packages/shell-emissions/`
   - `pkg/shim/` vs `packages/shim-generator/`
   - `pkg/symlink/` vs `packages/symlink-generator/`
   - `pkg/venv/` vs `packages/virtual-env/`
   - `cmd/dotfiles/` vs `packages/cli/`
3. **Installer Packages (Individual Plugins):**
   - `pkg/installer/` vs `packages/installer/` and all 15 individual installer packages (`packages/installer-apt/`, `packages/installer-brew/`, `packages/installer-cargo/`, `packages/installer-curl-binary/`, `packages/installer-curl-script/`, `packages/installer-curl-tar/`, `packages/installer-dmg/`, `packages/installer-dnf/`, `packages/installer-gitea/`, `packages/installer-github/`, `packages/installer-manual/`, `packages/installer-npm/`, `packages/installer-pacman/`, `packages/installer-pkg/`, `packages/installer-zsh-plugin/`)
4. **Networking, Archive & Utility Packages:**
   - `pkg/downloader/` vs `packages/downloader/`
   - `pkg/archive/` vs `packages/archive-extractor/`
   - `pkg/proxy/` vs `packages/http-proxy/`
   - `pkg/exec/` vs `packages/cli/` (exec utilities)
   - `pkg/utils/` vs `packages/utils/`
   - `pkg/version/` vs `packages/version-checker/`
5. **Build, Runtime, VM & Feature Packages:**
   - `pkg/arch/` vs `packages/arch/`
   - `pkg/config/` vs `packages/config/`
   - `pkg/dashboard/` vs `packages/dashboard/`
   - `pkg/features/` vs `packages/features/`
   - `pkg/logger/` vs `packages/logger/`
   - `pkg/unwrap/` vs `packages/unwrap-value/`
   - `pkg/vm/` vs `packages/core/` and `packages/tool-config-builder/`
   - `scripts/build/` and `scripts/typegen/` vs `packages/build/`

### Step 2: Dispatch Parallel Sub-Agents per Individual Package (1 Agent = 1 Package)

Launch **parallel sub-agents** concurrently (by making a workflow script call using `runs.all(...)` or concurrent sub-agent executions).

Assign **exactly one sub-agent per individual package pair** (for example, one sub-agent dedicated solely to `pkg/fs/` vs `packages/file-system/`, one sub-agent dedicated solely to `pkg/installer/apt.go` vs `packages/installer-apt/`, one sub-agent dedicated solely to `pkg/orchestrator/` vs `packages/generator-orchestrator/`, etc.):

- Open and read the Go source file(s) in `pkg/<pkg>` and corresponding TS source file(s) in `packages/<pkg>` side-by-side in full for that specific package.
- Construct an exhaustive method-by-method comparison matrix mapping TS function signatures to their exact Go counterparts for that single package.
- Detail any discrepancies in return types, default parameters, error handling, state tracking, and runtime semantic differences.
- Return a detailed, markdown-formatted report of their package findings.

### Step 3: Collect and Synthesize All Package Reports

Once all individual package substantive sub-agents have completed their tasks and returned their findings:

1. Carefully read and analyze each sub-agent's package report.
2. Identify any cross-component contract misalignments or hidden dependencies across packages.
3. Collate and systematically list ALL specific architectural, runtime, API, and semantic deficiencies identified across packages without omission.
4. Synthesize and consolidate all individual package findings into a single, cohesive, and comprehensive master report.

### Step 4: Write the Final Master Report to `./gaps-report.md`

Write the final aggregated and curated report directly to `./gaps-report.md` using the exact layout defined in the **Expected Report Output Format** section below, ensuring Section 7 ("Due Diligence Findings") includes every identified gap with severity, impact, and fix.

---

## 🔍 Investigation Directives

Ensure your sub-agents audit, and you aggregate, findings across the following critical domains:

### 1. The Core Question: Safe Demolition Feasibility

- **The `.tool.ts` Authoring Experience (DX):** If we delete `packages/core` and `packages/cli` today, how do we compile and type-check the user-authored `.tool.ts` configuration files? Does Go’s typegen output (`types.gen.ts`) provide a 100% complete type boundary (e.g. `defineTool`, `defineConfig`, `IFileSystem`) for IDE autocomplete? Or are there missing type declarations, helper functions, or imports that will cause compiler and editor errors?
- **The Dashboard Client & Backend Server:** The React/Preact dashboard client (`packages/dashboard/src/client/`) currently connects to REST API endpoints. If we delete the TS packages, does the Go-native dashboard server (`pkg/dashboard/dashboard.go`) implement every single API endpoint correctly, or are we missing backend logic? Does Go statically serve the bundled React assets?
- **The Build and NPM Packaging Pipeline:** How is `.dist/` assembled today? If the TS implementation goes away, what must be refactored in the build process to build React assets, embed them in Go, compile the binary, generate types from Go structs, and package `.dist/` for npm with zero legacy Node dependencies?

### 2. Unified State and Database Parity

- **State Logs & Verification:** Examine how data is represented across language boundaries in the SQLite database (`registry.db`). Look for discrepancies in data types, serialization formats (like octal vs. decimal representations of file permissions), and raw query structures.
- **Transaction Safety**: Audit transaction boundaries and connection pooling configurations. Does Go enforce atomic database transactions where TypeScript fails silently?

### 3. File System Abstractions & Sandboxing

- **Virtual vs Physical**: Examine both the in-memory (`MemFS`) and physical (`OSFS`) implementations. Are there methods present in TS's filesystem interfaces (like directory scanning, stat queries, symlinking) that are missing, stubbed, or bypassed in Go?
- **Sandboxing Leaks**: Audit sandboxing policies. Does `generate --dry-run` or test runs leak modifications (like writing real symlinks or creating directories) to the global host system, violating the local `.tmp` workspace boundary?

### 4. CLI Orchestration & Shell Initializations

- **Topological Sorters**: Compare the topological dependency sorters. Are there edge cases where Go and TS resolve ambiguous or missing dependencies differently?
- **Once-Scripts Lifecycle**: Verify the lifecycle of "once-scripts". Do they actually delete themselves after execution, or do they leak on disk and execute on every terminal startup?
- **Path and environment integrations**: Look for shell path duplication, `$PATH` or `$fpath` pollution, and the injection of CLI wrapper functions.

### 5. Installer Plugins and Dynamic Behaviors

- **15 Installer Methods**: Audit every single installer method (brew, cargo, npm, manual, Curl-based, system packages, etc.). Are there custom parameters, platform overrides (`platformConfigs`), or package uninstallation pipelines implemented in one language but completely missing or stubbed in the other?
- **Sudo Elevation**: Does Go strictly validate that an installer plugin supports sudo before running elevated configurations?

### 6. Test Suite Parity

- Compare the active test coverage of Go (`tests/e2e/`) with TS (`packages/e2e-test/src/__tests__/`).
- Identify which TS integration tests are missing from Go. Document the exact risk of deleting the TypeScript packages before these tests are natively translated.

---

## ✍️ Expected Report Output Format

Compile your findings and write them directly to `./gaps-report.md`. Your report must be structured, factual, and copy-pasteable, formatted as follows:

```markdown
# Go CLI Migration: Holistic Parity and Architectural Audit Report

## 1. Executive Summary

- **feasibility check: Can we delete TS and ship Go today without breaking anything?** (Direct, uncompromising answer to the core question, listing exactly what will break and what must be done to make it safe)
- Current Monorepo State (factual summary of the transitional hybrid state)
- Overall Migration Parity Score (out of 10, with hard technical justifications)
- Current Dual-Run Parity Status (`bun check:ci` analysis)

## 2. Feasibility Analysis (What Breaks on Demolition)

- Deep-dive analysis of the `.tool.ts` authoring experience, type boundary completeness, dashboard client/backend api gaps, and build pipeline requirements.

## 3. Structural & Architectural Gaps

- Detail any discrepancies in interfaces, package boundaries, data representation, sandboxing leaks, or serialization formats. Include a detailed comparison table mapping Go methods/functions to TS predecessors.

## 4. Installer & Package Manager Gaps

- Document all differences in installer features, uninstallation support, sudo validations, and system package management.

## 5. Test Coverage Gaps (TS vs. Go E2E)

- Provide a side-by-side comparison of active TS test files vs. Go test files.
- Detail the exact risk of deleting TypeScript before the remaining integration tests are translated.

## 6. Completed vs. Remaining Backlog

- Summarize what has been successfully merged (Wave 5).
- List the active, open Wave 6 tickets and map out a bulletproof, sequential roadmap to safely demolish TypeScript and transition to a pure statically-linked Go binary distribution.

## 7. Due Diligence Findings

- Systematically list ALL identified architectural gaps, runtime bugs, API deficiencies, and semantic divergences found during the audit across every package (with Severity/Category, Issue description, Impact, and Fix required for each item).
```
