# Directive for Package-Level Gap Check and Parity Audit

You are tasked with conducting an extremely rigorous, line-by-line, and highly skeptical audit of a specific package or component migration (comparing the Go implementation in `<package_path>` such as `pkg/<name>`, `cmd/<name>`, or `scripts/<name>` against its TypeScript predecessor in `packages/<name>`).

Your core objective is to answer for your assigned package:

**"Does the Go implementation provide 100% functional, semantic, and output parity with the TypeScript implementation, allowing the TypeScript package to be safely deleted?"**

---

## 🎯 Audit Philosophy: Zero-Tolerance for Satisficing

Do not rely on green test suites, interface compliance, or compile-time checks alone. Deceptive parity often hides in un-tested edge cases, default runtime behaviors, error handling paths, and logging details.

Act as a severe skeptic and adhere strictly to these principles:

1. **Compulsory Side-by-Side Reading**: Physically call the Read tool on BOTH the Go source file(s) and the corresponding TypeScript source file(s) in full. Do not summarize, skip files, rely on grep snippets, or read only exported headers.
2. **Full Method & API Mapping**: Map every single function, method, interface, type definition, export, default option, and constant from the TypeScript package to its Go counterpart.
3. **Audit the "Negative Space"**: Look for silent, non-textual runtime behavior differences between Node/Bun/TypeScript and Go.
4. **Stdout & Logging Exactness**: Ensure log messages, stdout emissions, and context formatting match expected CLI and parser standards without unexpected shifts.

---

## 🔍 Package Investigation Checklist

Audit your assigned package against each of the following semantic domains:

### 1. API Surface & Signature Completeness

- Are all exported methods, helper functions, options, and types in TypeScript implemented in Go?
- Are default parameter values in TypeScript explicitly handled in Go?
- Are optional fields, nullability, and empty slice/map vs `nil` representations handled consistently?

### 2. Runtime & Language Divergences ("Negative Space")

- **Map Iteration Order**: Go maps have randomized iteration order, whereas JavaScript preserves key insertion order. Check if directory lists, generated outputs, or config serialization rely on deterministic ordering.
- **Network & I/O Defaults**:
  - Does Go use unbounded HTTP client timeouts? (Default `http.Client` has no timeout, risking process hangs).
  - Are custom User-Agent headers, redirect policies, and buffer limits preserved?
- **Path Resolution & Tilde Expansion**:
  - Shells and Bun expand `~` and `~/` automatically. Go's `os` and `filepath` packages treat `~` as a literal directory name unless explicitly expanded. Check all path arguments and resolution logic.
- **Symlink & File System Sandboxing**:
  - Are hard links, symlinks, and broken links handled identically?
  - Do virtual filesystem implementations (`MemFS`) and physical implementations (`OSFS`) enforce strict sandboxing boundaries without leaking to host directories?
  - Is archive extraction protected against path traversal / Zip Slip vulnerabilities?
- **Subprocess & Execution Lifecycle**:
  - Do child processes or pipeline commands leak zombies on early error returns?
  - Are context cancellations and timeout signals propagated down to child subprocesses?
- **Data Serialization & Types**:
  - File permission bits: Are permissions serialized in octal vs decimal format in JSON or DB models?
  - Date/time formats and SQLite data type conversions.
- **Sudo Elevation & Interactive Boundaries**:
  - Does the package enforce `supportsSudo()` checks before invoking elevated operations?
  - Does non-interactive execution (CI/CD environments without TTY) hang on sudo or prompts?
- **Platform Overrides & Merging**:
  - Does platform override resolution (OS/Arch) match TypeScript's deep-merge / replacement heuristics?

### 3. Error Handling & Logging Parity

- **Structured Logging Hierarchy**: Logging must use the `tslog`-based safe logger. Every method/function that logs must create a sublogger with `name` for structural hierarchy, using `context` only for runtime identifiers (e.g. tool name).
- **No String Template Identifiers**: Do not embed runtime identifiers directly in log messages when `context` should provide them.
- **Error Object Propagation**: Pass error objects directly to the logger. Never extract `error.message` into log template strings.
- **Tab Separators**: Log assertions in tests must match tab separators (`\t`).
- **Single Failure Logging**: Log failures once at the boundary. Do not duplicate logs at multiple layers.

### 4. Test Suite Parity

- Compare Go `_test.go` unit tests against TypeScript `__tests__`.
- Identify any TypeScript test scenarios, edge cases, fixtures, or assertions missing in the Go test suite.

---

## ✍️ Output Format Conventions

- **Initial Gap Audit Report**: When producing an initial or standalone gap audit report, use the `# Package Audit Report` format below.
- **Reviewer Verdicts**: When evaluating a Worker's fixes during an active repair loop, Reviewer agents must use the `# Review Verdict: APPROVED` or `# Review Verdict: REJECTED` format defined in `./reviewer-package-instructions.md`.

```markdown
# Package Audit Report: `<package_path>` vs `<ts-package>`

## 1. Package Overview & Scope

- **Go Files Audited**: `<package_path>/...`
- **TS Files Audited**: `packages/<path>/...`
- **Overall Parity Status**: (Complete Parity / Gaps Identified / Incomplete Migration)

## 2. API & Signature Comparison Matrix

| TypeScript Export               | Go Counterpart             | Parity Status | Discrepancy / Notes |
| :------------------------------ | :------------------------- | :------------ | :------------------ |
| `function foo(x: string): void` | `func Foo(x string) error` | Pass / Gap    | Details...          |

## 3. Identified Gaps & Semantic Discrepancies

### Gap 1: [Short Title]

- **Severity**: Critical / High / Medium / Low
- **Category**: API Mismatch / Semantic Divergence / Error Handling / Sandboxing / Logging
- **TypeScript Behavior**: Detailed description of TS behavior.
- **Go Behavior**: Detailed description of Go behavior.
- **Impact**: Operational or functional risk.
- **Required Fix**: Concrete code change required in Go.

## 4. Test Coverage & Parity

- **TS Test Files**: `packages/<path>/__tests__/...`
- **Go Test Files**: `<package_path>/..._test.go`
- **Missing Test Scenarios**: List any specific tests present in TS but absent in Go.

## 5. Recommendation & Next Steps

- Clear summary statement on package readiness and required fixes before TypeScript demolition.
```
