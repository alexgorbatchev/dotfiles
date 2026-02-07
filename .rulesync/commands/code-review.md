---
targets:
  - '*'
description: >-
  Comprehensive code review prompt for large repositories, enforcing no sampling
  and detailed analysis.
copilot:
  agent: agent
---

# Comprehensive Code Review Prompt (No Sampling)

**Purpose:** Drive thorough, repeatable code reviews for large repos (monorepos, multi-package workspaces, or big single-package projects).

---

## 0) Non-Negotiables

1. **NO SAMPLING.** If a package is selected for “full review”, read _every_ source file in that package (and its tests).
2. **Evidence-based findings.** Every issue must include: location, minimal code excerpt, impact, and a concrete fix.
3. **State-driven continuity.** The only `.review/` file you read is `.review/STATE.md`. Never read `.review/modules/*.md`, `.review/SUMMARY.md`, `.review/CRITICAL.md`, or `.review/INDEX.md`.
4. **Deterministic progress.** Each run reviews exactly one package, updates STATE, and stops.
5. **No vague recommendations.** "Refactor" is not a recommendation—specify the refactor target and shape.

---

## 1) Outputs (Required Files)

All review artifacts **must** be written under `.review/`.

- Package reviews: `.review/modules/[module-name].md` (no `review-` prefix)
- Summary/index docs: `.review/[NAME].md` (e.g. `.review/INDEX.md`, `.review/SUMMARY.md`, `.review/CRITICAL.md`)

---

## 2) State File (Required)

Before reviewing, check if `.review/STATE.md` exists.

- **If it exists:** read it completely (and only it). Extract the `Queue (Remaining)` section, and select the next package (the first item).
- **If it does not exist:** create it by:
  1. Enumerating all packages in `packages/*/package.json` (alphabetical order)
  2. Initializing the state template (see section 2A below)
  3. Selecting the first package from the queue

### 2A) State File Template (`.review/STATE.md`)

Create this file on first run; update it after each package is reviewed.

This file is the single source of truth. Keep it concise.

```markdown
# Code Review State

- **Run size:** 1 package per run
- **Order:** Alphabetical
- **Last updated:** YYYY-MM-DD

## Inventory

Total packages: [N] (from `packages/*/`)

## Queue (Remaining)

Packages awaiting full-source review (in order):

1. [pkg-name]
2. [pkg-name]

[Continue numbering until the queue is exhausted.]

## Completed

- **[pkg-name]:** Grade [A|A-|B+|C|D+|D|F], Risk [low|medium|high]
  - Module: `.review/modules/[pkg-name].md`
  - Summary: [Exactly one sentence ending with a period.]
  - Issue counts: 🔴[N] 🟠[N] 🟡[N] 🟢[N]

## Global Themes

Cross-cutting themes across reviewed packages (maximum 5 bullets):

- [Exactly one sentence ending with a period.]

## Critical/High Issues Index

🔴/🟠 issues only, sorted by package:

- [pkg-name] / [Issue Title] ([🔴|🟠]): [Exactly one sentence ending with a period.] → `.review/modules/[pkg-name].md#[anchor]`

Anchor rules (deterministic):

- Each 🔴/🟠 issue in a module review must declare an explicit HTML anchor line: `<a id="[anchor]"></a>`.
- Anchors must use lowercase kebab-case: `[severity]-[title-slug]`.
- Example: `critical-shell-injection-vulnerability`
```

---

## 3) Continuation Algorithm

This algorithm is deterministic and resumable. Run it once per session.

### Step 1: Load or Initialize State

```bash
ls -la .review/STATE.md
```

- **If file exists:** Read it completely. Extract `Queue (Remaining)` and select the first package.
- **If file does not exist:** Create it by enumerating all packages and initializing the state template (see section 2A). Then select the first package.

### Step 2: Review Selected Package (Full-Source, No Sampling)

For the selected package:

#### A) Capture Counts

```bash
find packages/[pkg]/src -name "*.ts" ! -path "*__tests__*" | wc -l
find packages/[pkg] -name "*.test.ts" | wc -l
find packages/[pkg]/src -name "*.ts" -print0 | xargs -0 wc -l | tail -1
```

#### B) Read All Source Files (No Sampling)

```bash
find packages/[pkg]/src -name "*.ts" ! -path "*__tests__*" ! -path "*node_modules*" \
  | sort | while read -r file; do \
    echo ""; \
    echo "=== $file ==="; \
    echo ""; \
    cat "$file"; \
  done
```

While reading, track:

- **Architecture:** responsibilities, boundaries, layering, public API
- **Correctness:** edge cases, invariants, state transitions
- **Error handling:** propagation, typed errors, lost context, retries/backoff
- **Type safety:** `any`, assertions, unsafe casts, weak unions
- **Duplication:** repeated patterns and why they exist
- **Security:** shell construction, path traversal, unvalidated external inputs
- **Performance:** N² loops, large allocations, repeated I/O

#### C) Read All Test Files (No Sampling)

```bash
find packages/[pkg] -name "*.test.ts" | sort | while read -r file; do \
  echo ""; echo "=== $file ==="; echo ""; cat "$file"; \
done
```

Assess:

- Coverage breadth (key modules/functions present?)
- Coverage depth (error paths, edge cases, boundary conditions?)
- Test isolation & mocking quality
- Flakiness risks (timers, network, concurrency)

#### D) Targeted Pattern Scans (Find Hotspots)

Use only to _identify_ areas needing deeper inspection; do not skip full reads.

```bash
grep -R "\$\|exec\|spawn\|child_process" packages/[pkg]/src --include="*.ts"
grep -R "fetch\|http\|request\|axios" packages/[pkg]/src --include="*.ts"
grep -R ": any\|as any" packages/[pkg]/src --include="*.ts"
grep -R "TODO\|FIXME\|HACK" packages/[pkg]/src --include="*.ts"
```

### Step 3: Write Module Review Files

Create `.review/modules/[pkg].md` for the selected package using the exact format in section 4E.

### Step 4: Update State File

Edit `.review/STATE.md`:

1. Move the reviewed package from `Queue (Remaining)` to `Completed`.
2. Add a one-line summary for the completed package.
3. Add any 🔴/🟠 issues to the `Critical/High Issues Index`.
4. Update `Last updated` timestamp.

### Step 5: Regenerate Output Files

Regenerating from STATE only (do not read existing `.review/*.md` files):

- **`.review/INDEX.md`:** List all completed module reviews + summary docs.
- **`.review/SUMMARY.md`:** Summary entries for all completed packages (exactly as specified in section 4G).
- **`.review/CRITICAL.md`:** All 🔴/🟠 issues from STATE index, sorted by severity and package, with links to module files.

### Step 6: Stop

Do not start another package. Save all changes. Wait for the next run.

---

## 4) Output Formats (Required)

Reports must be **stable across runs**. Use these exact templates and ordering rules.

### 4A) Universal Formatting Rules

- **Date:** always `YYYY-MM-DD`.
- **Ordering:** alphabetical by package folder name.
- **Inventory stability:** assume `packages/*/` does not change during the review; do not reconcile Inventory mid-review.
- **Overwrite policy:** always rewrite `.review/INDEX.md`, `.review/SUMMARY.md`, `.review/CRITICAL.md` from `.review/STATE.md`.
- **Do not read:** any `.review/` file except `.review/STATE.md`.
- **Precedence rule:** if any section conflicts with section 4, section 4 is authoritative.
- **No ellipsis in outputs:** do not use a three-dot ellipsis in real generated files. Always list the full queue and all completed packages.

### 4B) Deterministic Anchor Slugs (Required)

Anchors must be generated deterministically.

Given a severity token and issue title, produce `[anchor]`:

1. `severity` is one of: `critical`, `high`.
2. `title` is the issue title string.
3. Build `title-slug` by:

- lowercasing
- replacing any non-alphanumeric character with `-`
- collapsing multiple `-` to a single `-`
- trimming leading/trailing `-`

4. Anchor is: `[severity]-[title-slug]`.
5. If an anchor is duplicated within the same module file, append `-2`, then `-3`, etc.

Example:

- Severity: `critical`
- Title: `Shell Injection: tar -xzf with untrusted path`
- Anchor: `critical-shell-injection-tar-xzf`

### 4C) Severity, Grade, Risk Tokens (Exact)

- Severity emojis (exact): `🔴` CRITICAL, `🟠` HIGH, `🟡` MEDIUM, `🟢` LOW
- Grades (exact, one of): `A`, `A-`, `B+`, `C`, `D+`, `D`, `F`
- Risk (exact, one of): `low`, `medium`, `high`

### 4D) Risk Determination (Deterministic)

Risk must be derived deterministically from the reviewed package and its findings:

- Set **Risk = high** if any of the following is true:
  - At least one 🔴 issue exists
  - The package executes shell commands (exec/spawn/`$`/child_process) AND has any 🟠 issue
  - The package performs network requests AND has any 🟠 issue

- Else set **Risk = medium** if any of the following is true:
  - At least one 🟠 issue exists
  - The package executes shell commands (exec/spawn/`$`/child_process)
  - The package performs network requests
  - The package performs file writes/deletes outside of tests

- Else set **Risk = low**.

Network/shell/file-write detection must be based on what you read in the selected package source.

### 4E) `.review/modules/[pkg].md` (Full Review)

Exact top section:

```markdown
# Code Review: [Package Name]

**Package:** `packages/[pkg-name]`
**Review Date:** YYYY-MM-DD
**Files Reviewed:** [N] source + [M] test files
**Lines of Code:** ~[L]
**Grade:** [A|A-|B+|C|D+|D|F]
**Risk:** [low|medium|high]
```

Exact required section order (do not rename headings):

1. `## Overview`
2. `## Code Quality Analysis`
3. `## Duplication Analysis`
4. `## Test Coverage Analysis`
5. `## Issues Summary`
6. `## Recommendations`
7. `## Conclusion`

Exact issue block format (use everywhere issues appear; include HTML anchor for 🔴/🟠):

````markdown
<a id="[anchor]"></a>

[emoji] **[SEVERITY]:** [Issue Title]
**Location:** `packages/[pkg-name]/path/to/file.ts` — [function `name` | line N]
**Description:** [Exactly one sentence ending with a period.]
**Evidence:**

```ts
[minimal excerpt]
```
````

**Impact:** [Exactly one sentence ending with a period.]
**Fix:** [A numbered list of concrete steps.]

````
Notes:

- For 🟡/🟢 issues, omit the anchor line.
- `Evidence` must be minimal (only lines needed to prove the issue).
- `Fix` must be actionable and specific; avoid “refactor” without naming the target shape.

### 4F) `.review/INDEX.md` (Regenerated)

Exact structure:

```markdown
# Code Review Index

**Last Updated:** YYYY-MM-DD
**Status:** [COMPLETED] of [TOTAL] packages completed

## Completed Reviews

- [pkg-name] — Grade [X], Risk [Y] → `.review/modules/[pkg-name].md`
  - [One sentence summary from STATE]

## Remaining Queue

1. [pkg-name]
2. [pkg-name]

[Continue numbering until the queue is exhausted.]

## Summary

See `.review/SUMMARY.md`.

## Critical Issues

See `.review/CRITICAL.md`.
````

### 4G) `.review/SUMMARY.md` (Regenerated)

Exact structure:

```markdown
# Code Review Summary

**Last Updated:** YYYY-MM-DD
**Total Packages:** [TOTAL] | **Completed:** [COMPLETED] | **Remaining:** [REMAINING]

## Completed Packages

#### [pkg-name]

- **Grade:** [A|A-|B+|C|D+|D|F]
- **Risk:** [low|medium|high]
- **Module:** `.review/modules/[pkg-name].md`
- **Summary:** [One sentence from STATE]
- **Issue counts:** 🔴[N] 🟠[N] 🟡[N] 🟢[N]

## Remaining Queue

1. [pkg-name]
2. [pkg-name]

[Continue numbering until the queue is exhausted.]

## Global Themes

- [Each bullet is exactly one sentence ending with a period.]
```

### 4H) `.review/CRITICAL.md` (Regenerated)

Exact structure:

```markdown
# Critical and High Issues

**Last Updated:** YYYY-MM-DD
**Total Issues:** [N]

## 🔴 CRITICAL

#### [pkg-name] / [Issue Title]

- **Location:** `.review/modules/[pkg-name].md#[anchor]`
- **Description:** [One sentence from STATE]
- **Impact:** [Exactly one sentence ending with a period.]

## 🟠 HIGH

#### [pkg-name] / [Issue Title]

- **Location:** `.review/modules/[pkg-name].md#[anchor]`
- **Description:** [One sentence from STATE]
- **Impact:** [Exactly one sentence ending with a period.]
```

---

## 5) Issue Severity (Required)

- 🔴 **CRITICAL (blocking):** vulnerability, data loss/corruption, crash/hang, contract violations
- 🟠 **HIGH:** major maintainability debt, large duplication, big test gaps, serious perf risks
- 🟡 **MEDIUM:** important improvements, moderate duplication, missing edge-case tests
- 🟢 **LOW:** polish, minor clarity improvements

Each issue must include:

1. **Location:** file + symbol (and approximate line if available)
2. **Description:** what is wrong
3. **Evidence:** minimal code excerpt
4. **Impact:** why it matters
5. **Fix:** concrete steps (not “refactor”) + optional alternative

---

## 6) Grades

Grades are an overall signal, not an average.

- Any 🔴 **CRITICAL** issue caps the grade at **D+** (or **F** if exploitable/unsafe by default).
- Otherwise, weigh:
  - Architecture (25%)
  - Type safety (20%)
  - Error handling (15%)
  - Testing (15%)
  - Code quality/duplication (15%)
  - Security (10%)

---

## 7) Final Deliverables (Required)

1. `.review/INDEX.md`: links to all module reviews and summary docs
2. `.review/SUMMARY.md`: quick assessments for all packages + grades
3. `.review/CRITICAL.md`: only 🔴/🟠 issues across the repo, with links back to module files
4. `.review/modules/*.md`: full reviews for selected packages

---

## 8) Reviewer Completion Checklist

- [ ] Full-review packages: read all source + all tests (no sampling)
- [ ] Findings include evidence + impact + concrete fix
- [ ] Every package has a summary entry
- [ ] All artifacts live under `.review/`
- [ ] Grades reflect severity caps and rubric
