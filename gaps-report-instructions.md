# Directive for Conducting a Holistic Migration and Parity Audit

You are tasked with conducting a rigorous, open-ended, and highly skeptical audit of the entire repository to answer the ultimate core question of this migration:

**"Can we delete the TypeScript implementation and ship the Go CLI to users today without breaking anything?"**

We want to completely delete the TypeScript implementation (`packages/*`) and only leave the necessary components to work with `.tool.ts` files and the Golang CLI. Is the codebase ready for this demolition today? If not, what exact structural, compile-time, or runtime breakages would occur, and what must be completed to make this demolition safe?

Write your final findings and analysis as a comprehensive **Migration and Parity Gap Report** directly to `./gaps-report.md`.

---

## 🎯 Audit Philosophy: No Blinders, No Compromises

Previous agents have repeatedly suffered from **local-scope bias**—they looked only at individual tickets or passing unit tests and over-confidently declared "100% parity." You must avoid this failure mode. A green test suite does not guarantee structural or behavioral equivalence. 

You are a severe skeptic:
1.  **Do not limit your search** to a pre-defined list of files. You must explore the *entire* codebase.
2.  **See something, say something.** If an implementation looks like a shallow "cat-and-mouse" linter/compiler satisfaction bypass, or trades away correctness, call it out.
3.  **Audit the silent gaps.** Look for dead code, unreferenced Go packages, platform-specific behavior omissions, silent error swallowing, resource leaks, or discrepancies in data serialization.

---

## 🤖 Multi-Agent Dispatching and Aggregation Protocol

To maximize thoroughness, performance, and depth of analysis, you **must not** conduct this audit alone. You must act as the **Orchestration Agent** and delegate specialized package-level audits to parallel sub-agents, and then synthesize their findings into the final report.

### Step 1: Divide the Codebase into Discrete Modules
Segment the monorepo into the following five core functional modules:
1.  **Core File System & Database State:** Go's `pkg/fs/`, `pkg/db/`, `pkg/registry/` vs TS's `packages/file-system/`, `packages/registry/`, `packages/registry-database/`.
2.  **Orchestration, Shell Scripts & Sorters:** Go's `pkg/orchestrator/`, `pkg/shellinit/`, `cmd/dotfiles/generate.go` vs TS's `packages/generator-orchestrator/`, `packages/shell-init-generator/`, `packages/cli/src/generateCommand.ts`.
3.  **Installer Registry & Package Managers:** Go's `pkg/installer/` vs TS's `packages/installer/`, `packages/installer-*/`.
4.  **Networking, Extractors & Proxy:** Go's `pkg/downloader/`, `pkg/archive/`, `pkg/proxy/` vs TS's `packages/downloader/`, `packages/archive-extractor/`, `packages/http-proxy/`.
5.  **Build Pipeline, Dashboard & Typings:** Go's `pkg/dashboard/`, `pkg/unwrap/`, `pkg/arch/` vs TS's `packages/build/`, `packages/dashboard/`, `packages/unwrap-value/`.

### Step 2: Dispatch Parallel Sub-Agents
Launch **five parallel sub-agents** concurrently (by making a single message containing five concurrent `task` tool calls of type `explore` or `general`). 

For each sub-agent, provide a highly specific, customized version of this audit directive. Instruct them to:
- Deeply inspect their assigned directory segment in both languages.
- Uncover any discrepancies in method signatures, parameter schemas, performance, security, and state handling.
- Return a detailed, markdown-formatted report of their findings.

### Step 3: Collect and Synthesize Reports
Once all five parallel sub-agents have completed their tasks and returned their findings:
1.  Carefully read and analyze each sub-agent's report.
2.  Identify any cross-component contract misalignments or hidden dependencies.
3.  Synthesize and consolidate their findings into a single, cohesive, and comprehensive master report.

### Step 4: Write the Final Master Report to `./gaps-report.md`
Write the final aggregated and curated report directly to `./gaps-report.md` using the exact layout defined in the **Expected Report Output Format** section below.

---

## 🔍 Investigation Directives

Ensure your sub-agents audit, and you aggregate, findings across the following critical domains:

### 1. The Core Question: Safe Demolition Feasibility
*   **The `.tool.ts` Authoring Experience (DX):** If we delete `packages/core` and `packages/cli` today, how do we compile and type-check the user-authored `.tool.ts` configuration files? Does Go’s typegen output (`types.gen.ts`) provide a 100% complete type boundary (e.g. `defineTool`, `defineConfig`, `IFileSystem`) for IDE autocomplete? Or are there missing type declarations, helper functions, or imports that will cause compiler and editor errors?
*   **The Dashboard Client & Backend Server:** The React/Preact dashboard client (`packages/dashboard/src/client/`) currently connects to REST API endpoints. If we delete the TS packages, does the Go-native dashboard server (`pkg/dashboard/dashboard.go`) implement every single API endpoint correctly, or are we missing backend logic? Does Go statically serve the bundled React assets?
*   **The Build and NPM Packaging Pipeline:** How is `.dist/` assembled today? If the TS implementation goes away, what must be refactored in the build process to build React assets, embed them in Go, compile the binary, generate types from Go structs, and package `.dist/` for npm with zero legacy Node dependencies?

### 2. Unified State and Database Parity
*   Execute and inspect the dual-run verification harness (`scripts/parity-harness/main.go`). Do Go and TS produce identical outputs, or are we masking differences (such as ignoring file sizes, timestamps, or execution logs)?
*   Examine how data is represented across language boundaries in the SQLite database (`registry.db`). Look for discrepancies in data types, serialization formats (like octal vs. decimal representations of file permissions), and raw query structures.
*   Audit transaction boundaries and connection pooling configurations. Does Go enforce atomic database transactions where TypeScript fails silently?

### 3. File System Abstractions & Sandboxing
*   Examine both the in-memory (`MemFS`) and physical (`OSFS`) implementations. Are there methods present in TS's filesystem interfaces (like directory scanning, stat queries, symlinking) that are missing, stubbed, or bypassed in Go?
*   Audit sandboxing policies. Does `generate --dry-run` or test runs leak modifications (like writing real symlinks or creating directories) to the global host system, violating the local `.tmp` workspace boundary?

### 4. CLI Orchestration & Shell Initializations
*   Compare the topological dependency sorters. Are there edge cases where Go and TS resolve ambiguous or missing dependencies differently?
*   Verify the lifecycle of "once-scripts". Do they actually delete themselves after execution, or do they leak on disk and execute on every terminal startup?
*   Check path and environment integrations. Look for shell path duplication, `$PATH` or `$fpath` pollution, and the injection of CLI wrapper functions.
*   Verify profile injection. How does Go update shell profiles compared to TS, and do their block markers conflict?

### 5. Installer Plugins and Dynamic Behaviors
*   Audit the 15 installer methods (brew, cargo, npm, manual, Curl-based, system packages, etc.). Are there custom parameters, platform overrides (`platformConfigs`), or package uninstallation pipelines implemented in one language but completely missing or stubbed in the other?
*   Examine privilege escalation. Does Go strictly validate that an installer plugin supports sudo before running elevated configurations?

### 6. Test Suite Parity
*   Compare the active test coverage of Go (`tests/e2e/`) with TS (`packages/e2e-test/src/__tests__/`). 
*   Identify which TS integration tests are missing from Go. Document the exact risk of deleting the TypeScript packages before these tests are natively translated.

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
- Detail any discrepancies in interfaces, package boundaries, data representation, sandboxing leaks, or serialization formats.

## 4. Installer & Package Manager Gaps
- Document all differences in installer features, uninstallation support, sudo validations, and system package management.

## 5. Test Coverage Gaps (TS vs. Go E2E)
- Provide a side-by-side comparison of active TS test files vs. Go test files.
- Detail the exact risk of deleting TypeScript before the remaining integration tests are translated.

## 6. Completed vs. Remaining Backlog
- Summarize what has been successfully merged (Wave 5).
- List the active, open Wave 6 tickets and map out a bulletproof, sequential roadmap to safely demolish TypeScript and transition to a pure statically-linked Go binary distribution.
```
