# Directive for Conducting a Holistic Migration and Parity Audit

You are tasked with conducting a rigorous, open-ended, and highly skeptical audit of the entire repository to uncover any and all gaps, architectural drift, performance bottlenecks, or hidden technical debt between the legacy TypeScript implementation (`packages/*`) and the new Go implementation (`pkg/*`, `cmd/*`).

Write your final findings as a comprehensive **Migration and Parity Gap Report** directly to `./gaps-report.md`.

---

## 🎯 Audit Philosophy: No Blinders, No Compromises

Previous agents have repeatedly suffered from **local-scope bias**—they looked only at individual tickets or passing unit tests and over-confidently declared "100% parity." You must avoid this failure mode. A green test suite does not guarantee structural or behavioral equivalence. 

You are a severe skeptic:
1.  **Do not limit your search** to a pre-defined list of files. You must explore the *entire* codebase.
2.  **See something, say something.** If an implementation looks like a shallow "cat-and-mouse" linter/compiler satisfaction bypass, or trade away correctness, call it out.
3.  **Audit the silent gaps.** Look for dead code, unreferenced Go packages, platform-specific behavior omissions, silent error swallowing, resource leaks, or discrepancies in data serialization.

---

## 🔍 Investigation Directives

Your audit must cover, but is not limited to, the following domains:

### 1. Unified State and Database Parity
*   Execute and inspect the dual-run verification harness (`scripts/parity-harness/main.go`). Do Go and TS produce identical outputs, or are we masking differences (such as ignoring file sizes, timestamps, or execution logs)?
*   Examine how data is represented across language boundaries in the SQLite database (`registry.db`). Look for discrepancies in data types, serialization formats (like octal vs. decimal representations of file permissions), and raw query structures.
*   Audit transaction boundaries and connection pooling configurations. Does Go enforce atomic database transactions where TypeScript fails silently?

### 2. File System Abstractions & Sandboxing
*   Examine both the in-memory (`MemFS`) and physical (`OSFS`) implementations. Are there methods present in TS's filesystem interfaces (like directory scanning, stat queries, symlinking) that are missing, stubbed, or bypassed in Go?
*   Audit sandboxing policies. Does `generate --dry-run` or test runs leak modifications (like writing real symlinks or creating directories) to the global host system, violating the local `.tmp` workspace boundary?

### 3. CLI Orchestration & Shell Initializations
*   Compare the topological dependency sorters. Are there edge cases where Go and TS resolve ambiguous or missing dependencies differently?
*   Verify the lifecycle of "once-scripts". Do they actually delete themselves after execution, or do they leak on disk and execute on every terminal startup?
*   Check path and environment integrations. Look for shell path duplication, `$PATH` or `$fpath` pollution, and the injection of CLI wrapper functions.
*   Verify profile injection. How does Go update shell profiles compared to TS, and do their block markers conflict?

### 4. Installer Plugins and Dynamic Behaviors
*   Audit the 15 installer methods (brew, cargo, npm, manual, Curl-based, system packages, etc.). Are there custom parameters, platform overrides (`platformConfigs`), or package uninstallation pipelines implemented in one language but completely missing or stubbed in the other?
*   Examine privilege escalation. Does Go strictly validate that an installer plugin supports sudo before running elevated configurations?

### 5. Test Suite Parity
*   Compare the active test coverage of Go (`tests/e2e/`) with TS (`packages/e2e-test/src/__tests__/`). 
*   Identify which TS integration tests are missing from Go. Document the exact risk of deleting the TypeScript packages before these tests are natively translated.

---

## ✍️ Expected Report Output Format

Compile your findings and write them directly to `./gaps-report.md`. Your report must be structured, factual, and copy-pasteable, formatted as follows:

```markdown
# Go CLI Migration: Holistic Parity and Architectural Audit Report

## 1. Executive Summary
- Current Monorepo State (factual summary of the transitional hybrid state)
- Overall Migration Parity Score (out of 10, with hard technical justifications)
- Current Dual-Run Parity Status (`bun check:ci` analysis)

## 2. Structural & Architectural Gaps
- Detail any discrepancies in interfaces, package boundaries, data representation, sandboxing leaks, or serialization formats.

## 3. Installer & Package Manager Gaps
- Document all differences in installer features, uninstallation support, sudo validations, and system package management.

## 4. Test Coverage Gaps (TS vs. Go E2E)
- Provide a side-by-side comparison of active TS test files vs. Go test files.
- Detail the exact risk of deleting TypeScript before the remaining integration tests are translated.

## 5. Completed vs. Remaining Backlog
- Summarize what has been successfully merged (Wave 5).
- List the active, open Wave 6 tickets and map out a bulletproof, sequential roadmap to safely demolish TypeScript and transition to a pure statically-linked Go binary distribution.
```
