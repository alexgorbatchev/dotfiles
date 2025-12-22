# Comprehensive Code Review Prompt

**Purpose:** Detailed instructions for performing thorough code reviews of large codebases  
**Scope:** Monorepos, multi-package projects, or large single projects  
**Level:** Intermediate to Advanced  

---

## Table of Contents

1. [Overview & Approach](#overview--approach)
2. [Pre-Review Planning](#pre-review-planning)
3. [Review Methodology](#review-methodology)
4. [What to Analyze](#what-to-analyze)
5. [Documentation Standards](#documentation-standards)
6. [Grade System](#grade-system)
7. [Critical vs Priority Issues](#critical-vs-priority-issues)
8. [Tools & Techniques](#tools--techniques)
9. [Complete Example](#complete-example)

---

## Overview & Approach

### Core Principle

**NO SAMPLING.** Comprehensive code reviews require analyzing complete source files, not patterns. Sampling misses important:
- Code duplication across files
- Inconsistent implementations
- Subtle bugs and edge cases
- Architectural debt
- Test gaps

### Two-Tier Strategy

For large codebases (20+ packages), use a **two-tier approach**:

1. **Full-Source Reviews:** 3-6 critical/complex packages (deep analysis)
2. **Quick Assessments:** Remaining packages (structural analysis only)

This balances thoroughness with efficiency.

### Time Estimates

- **Full-source review per package:** 1-2 hours (depending on size)
- **Quick assessment per package:** 10-20 minutes
- **Typical monorepo (27 packages):** 10-15 hours total

---

## Pre-Review Planning

### Step 1: Understand the Codebase Structure

```bash
# List all packages/modules
find . -name "package.json" -o -name "*.toml" | head -20

# Determine language and framework
grep -r "typescript\|javascript\|python\|rust" package.json | head -5

# Check for monorepo structure
ls -la | grep -E "packages|src|lib"

# Count files by type
find . -name "*.ts" -o -name "*.py" | wc -l
find . -name "*.test.ts" -o -name "*_test.py" | wc -l
```

### Step 2: Identify Packages to Fully Review

Choose packages based on:
- **Criticality:** Core functionality, security-sensitive code
- **Complexity:** Large files, intricate logic
- **Risk:** Areas with few tests, recent changes
- **Coupling:** Central dependencies (core, utils, config)

**Rule:** Review top 3-4 most critical packages fully, assess others quickly.

### Step 3: Create Review Plan

Document:
- Which packages get full review
- Which packages get quick assessment  
- Estimated time per package
- Identified risk areas

Example:
```
FULL REVIEW:
- cli (23 files, 2,943 lines) - entry point, complexity
- config (9 files, 1,060 lines) - critical path
- core (41 files, 2,742 lines) - type definitions

QUICK ASSESS:
- All other 24 packages (structure only)

RISK AREAS IDENTIFIED:
- archive-extractor (shell commands)
- build (monolithic orchestration)
```

---

## Review Methodology

### Phase 1: Full-Source Reviews

For selected packages, follow this exact process:

#### 1A. Read All Source Files

```bash
# Dump all source code to understand complete codebase
find /path/to/package/src -name "*.ts" ! -path "*__tests__*" ! -path "*node_modules*" \
  | sort | while read -r file; do \
    echo ""; \
    echo "=== $(basename "$file") ==="; \
    echo ""; \
    cat "$file"; \
    echo ""; \
  done | head -c 200000  # Limit output to manageable size
```

**Why:** Seeing all code together reveals patterns, duplication, and architecture you'd miss reading files individually.

#### 1B. Document Initial Observations

As you read, note:
- **Architecture:** How files are organized, main patterns
- **Duplication:** Repeated code, similar functions
- **Dependencies:** What imports exist, coupling patterns
- **Type Safety:** Explicit types, use of `any`, generics
- **Error Handling:** Try-catch patterns, error types
- **Testing:** Test organization, coverage level
- **Logging:** Consistency, message patterns
- **Security:** Injection risks, file handling, validation

#### 1C. Analyze Test Files

```bash
# Count and list test files
find /path/to/package -name "*.test.ts" -o -name "*_test.py" | wc -l
find /path/to/package -name "*.test.ts" | head -20
```

**What to check:**
- Coverage breadth (all major functions tested?)
- Coverage depth (edge cases tested?)
- Test organization (clear structure, good naming?)
- Test helpers (duplication in fixtures/mocks?)
- Async handling (promises, callbacks tested properly?)

#### 1D. Create Detailed Analysis Document

For each package, write a comprehensive review including:
- Overview (purpose, main files, size)
- Architecture strengths
- Code quality analysis (per major component)
- Duplication analysis (specific examples)
- Test coverage analysis
- Issues found (with code examples)
- Recommendations (by priority)
- Grade (A/A-/B+/C/D+/F)

---

### Phase 2: Quick Assessments

For remaining packages, use structural analysis:

#### 2A. File Structure Analysis

```bash
# Understand package structure
tree -L 3 /path/to/package/

# Count and classify files
find /path/to/package/src -name "*.ts" | wc -l  # source files
find /path/to/package -name "*.test.ts" | wc -l # test files
du -sh /path/to/package/src                      # total size
```

**What to check:**
- File organization (single responsibility?)
- Naming consistency (files match exports?)
- Test directory structure (co-located with source?)
- README/documentation presence

#### 2B. Pattern Detection

Look for:
- **Duplication patterns:** Similar code across multiple files
- **Architecture patterns:** Observable design patterns
- **Naming patterns:** Consistency in function/file naming
- **Dependency patterns:** How packages depend on each other
- **Risk patterns:** Shell commands, external API calls, file I/O

```bash
# Find shell command usage
grep -r "\$\|\`.*\`\|exec\|spawn" /path/to/package/src --include="*.ts"

# Find file I/O
grep -r "fs\.\|readFile\|writeFile" /path/to/package/src --include="*.ts"

# Find external API calls
grep -r "fetch\|http\|request\|axios" /path/to/package/src --include="*.ts"
```

#### 2C. Interface & Type Checking

```bash
# Check for any types (should be minimal/zero)
grep -r ": any\|as any" /path/to/package/src --include="*.ts" | wc -l

# Check for export patterns
grep -r "^export " /path/to/package/src --include="*.ts" | head -20
```

#### 2D. Create Quick Assessment

For quick assessments, write a summary including:
- Package purpose
- File organization assessment
- Estimated grade
- Risk level
- Patterns observed
- Any red flags
- No detailed code examples needed

---

## What to Analyze

### 1. Code Quality Dimensions

#### Type Safety
- **Check:** Are types explicit or inferred?
- **Look for:** `any`, type assertions (`as Type`), untyped functions
- **Good:** `function calculate(x: number): number`
- **Bad:** `function calculate(x: any): any`
- **Verdict:** Grade penalty for widespread `any` usage

#### Duplication
- **Check:** Is code repeated across multiple files?
- **Look for:** Similar logic in different places
- **Examples:**
  - Same pattern in 3+ functions
  - Test helpers with 80%+ similarity
  - Error handling boilerplate (try-catch repeated)
  - File operations (mkdir, rm, copy patterns)
- **Metric:** Flag >50 lines of duplicated patterns

#### Error Handling
- **Check:** How are errors handled?
- **Look for:** 
  - Try-catch patterns (consistent or varied?)
  - Error types (custom or generic?)
  - Error messages (clear or cryptic?)
  - Unhandled promises or async/await
- **Pattern:** Rich error hierarchies are good; generic Error(...) is bad

#### Testing
- **Check:** Are functions covered by tests?
- **Metrics:**
  - 0-3 tests per file = insufficient
  - 4-8 tests per file = adequate
  - 9+ tests per file = good
  - Tests for error cases = excellent
- **Look for:** Tests matching function complexity

#### Logging
- **Check:** Are operations logged for debugging?
- **Pattern:** Should trace execution flow
- **Bad:** No logging or overly verbose
- **Good:** INFO for major operations, DEBUG for details

#### Security
- **Check:** Are there injection risks?
- **Look for:**
  - Shell command construction (`$`, exec, spawn)
  - SQL query building
  - File path handling
  - External input validation
- **Critical:** Shell injection using string concatenation

#### Performance
- **Check:** Are operations efficient?
- **Look for:**
  - Loops within loops (quadratic time)
  - Synchronous I/O in async contexts
  - Unbounded arrays or recursion
  - Excessive object creation

### 2. Architecture Patterns

#### Dependency Injection
- Are dependencies passed or imported?
- **Good:** Injected (testable)
- **Bad:** Global imports (hard to test)

#### Separation of Concerns
- Does each file/function have single responsibility?
- **Look for:** Functions doing multiple things
- **Bad:** 300+ line functions
- **Good:** Functions <50 lines

#### Interface Contracts
- Are behaviors defined by interfaces?
- **Good:** Clear interface boundaries
- **Bad:** Tight coupling between modules

#### Error Hierarchy
- Are specific error types used?
- **Good:** `NotFoundError`, `PermissionError`, `NetworkError`
- **Bad:** Everything throws generic `Error`

#### Configuration
- How is configuration handled?
- **Good:** Centralized, validated, typed
- **Bad:** Scattered, unvalidated, string-based

### 3. Common Anti-Patterns

#### God Objects
- Classes/interfaces with 15+ properties/methods
- **Example:** IServices with 22 properties
- **Impact:** Hard to test, understand, modify
- **Recommendation:** Split into smaller focused interfaces

#### Boilerplate Code
- Repetitive code that could be abstracted
- **Example:** 10 command registration functions with 95% identical code
- **Impact:** Maintenance burden, consistency issues
- **Recommendation:** Extract to helper/factory

#### Monolithic Modules
- Large files (>300 lines) with mixed concerns
- **Example:** Build orchestration with 50+ files, unclear boundaries
- **Impact:** Hard to understand, test, modify
- **Recommendation:** Split into smaller focused modules

#### Silent Failures
- Errors caught but not logged or re-thrown
- **Bad:** `try { ... } catch (e) { /* ignored */ }`
- **Impact:** Debugging nightmare
- **Recommendation:** Always log or re-throw

#### Implicit Dependencies
- Services/configuration assumed to exist globally
- **Example:** Reading `process.platform` instead of accepting as parameter
- **Impact:** Hard to test, not flexible
- **Recommendation:** Inject as parameter

---

## Documentation Standards

### Structure for Full-Source Reviews

Each detailed review should include these sections in order:

#### 1. Header
```markdown
# Code Review: [Package Name]

**Package:** `packages/[name]`
**Review Date:** December 19, 2025
**Files Reviewed:** X source + Y test files
**Lines of Code:** ~N
**Grade:** [A/A-/B+/C/D+/F]
```

#### 2. Overview
```markdown
## Overview

[1-2 paragraph description of package purpose]

### Architecture Strengths
✅ [List 3-5 positive aspects]
```

#### 3. Code Quality Analysis
```markdown
## Code Quality Analysis

### 1. [Component Name] ([File Name])

**Strengths:**
- ✅ [specific positive]

**Issues Found:**
🟡 **MEDIUM:** [Issue description]
- Code example
- Impact
- Recommendation
```

#### 4. Duplication Analysis
```markdown
## Duplication Analysis

### [Pattern Name]
🟡 **MEDIUM:** [Description]
- Example code
- Where it appears
- Solution

**Estimated duplication:** X lines
```

#### 5. Test Coverage
```markdown
## Test Coverage Analysis

**Test Files:** X
**Coverage:** [Assessment]

### Strengths
- ✅ [Positive]

### Gaps
- 🟡 [Missing tests for X scenario]
```

#### 6. Issues Summary
```markdown
## Issues Summary

### 🔴 CRITICAL
[List blocking issues]

### 🟠 HIGH
[List important issues]

### 🟡 MEDIUM
[List nice-to-fix issues]

### ✅ NO ISSUES
[If applicable]
```

#### 7. Recommendations
```markdown
## Recommendations

### High Priority
1. [What to do]
2. [What to do]

### Medium Priority
1. [What to do]

### Low Priority
1. [What to do]
```

#### 8. Conclusion
```markdown
## Conclusion

[Summary paragraph]

**Grade: [A-F]**

### Final Checklist
- [dimension]: [assessment]
```

### Structure for Quick Assessments

For quick assessments, use condensed format:

```markdown
#### [Package Name]
- **Grade:** [A/A-/B+/C]
- **Size:** [# files, # lines]
- **Assessment:** [1-2 sentence]
- **No Issues** or **Issues:** [if any]
```

---

## Grade System

### Grading Rubric

| Grade | Meaning | Characteristics | Action |
|-------|---------|-----------------|--------|
| **A** | Excellent | No issues, clean code, good tests, solid architecture | Production ready, exemplary |
| **A-** | Very Good | Minor improvements suggested, solid implementation | Production ready, consider polish |
| **B+** | Good | Some improvements needed, acceptable quality | Production ready, schedule fixes |
| **C** | Moderate | Multiple issues, needs attention before use | Use with caution, plan fixes |
| **D+** | Fair | Significant issues, refactoring recommended | Risky, major improvements needed |
| **D** | Poor | Critical flaws, unsafe to deploy | Do not deploy |
| **F** | Fail | Cannot use, must rewrite | Reject, requires redesign |

### Grade Factors

Calculate grade by weighing:

1. **Architecture (25%):** Clarity, separation of concerns, patterns
2. **Type Safety (20%):** Explicit types, minimal `any`, proper generics
3. **Error Handling (15%):** Consistent patterns, specific error types, logging
4. **Testing (15%):** Coverage breadth, coverage depth, test quality
5. **Code Quality (15%):** Duplication, clarity, naming, size
6. **Security (10%):** No injection risks, proper validation, safe operations

**Critical Issues:** Single critical issue = automatic F or D+ grade (override rubric)

---

## Critical vs Priority Issues

### Issue Severity Classification

#### 🔴 CRITICAL (Blocking)
- Security vulnerabilities (injection, data loss)
- Runtime errors (crashes, hangs)
- Data corruption risks
- API contract violations

**Action:** Must fix before deployment  
**Impact:** Blocks release  
**Example:** Shell injection vulnerability

#### 🟠 HIGH (Urgent)
- Significant duplication (maintenance debt)
- Missing test coverage (regression risk)
- Architectural problems (coupling, god objects)
- Performance issues (timeouts, memory leaks)

**Action:** Should fix this sprint  
**Impact:** Affects maintainability  
**Example:** Duplicate functions in two places

#### 🟡 MEDIUM (Important)
- Code duplication (<50 lines)
- Minor anti-patterns
- Incomplete implementation
- Documentation gaps

**Action:** Fix next sprint  
**Impact:** Nice-to-have improvements  
**Example:** Platform mapping repeated in two places

#### 🟢 LOW (Polish)
- Code style (not blocking)
- Minor naming improvements
- Comment additions
- Test organization

**Action:** Fix when convenient  
**Impact:** Code cleanliness  
**Example:** Test helper naming convention

### Issue Documentation Format

Always include:
1. **Location:** File name and approximate line number/function
2. **Description:** What the issue is
3. **Code Example:** Show the problematic code
4. **Impact:** Why this matters
5. **Fix:** How to resolve it
6. **Severity:** Critical/High/Medium/Low

```markdown
🔴 **CRITICAL:** Shell Injection Vulnerability
**Location:** `packages/archive-extractor/src/ArchiveExtractor.ts`

**Description:** Command construction uses string concatenation with basic quote escaping.

**Code:**
```typescript
`tar -xzf '${archivePath}' -C '${tempExtractDir}'`
```

**Impact:** Allows arbitrary command execution if paths contain special characters.

**Fix:** Use execFile() or Bun's $ operator with parameter passing instead of string interpolation.
```

---

## Tools & Techniques

### Essential Commands

```bash
# Count files and lines
find /path -name "*.ts" ! -path "*__tests__*" | wc -l
find /path -name "*.ts" | xargs wc -l | tail -1

# Read all source files
find /path/src -name "*.ts" | sort | while read f; do \
  echo "=== $(basename $f) ==="; cat "$f"; echo ""; \
done | head -c 200000

# Search for patterns
grep -r "shell injection pattern" /path/src
grep -rn "TODO\|FIXME\|HACK" /path/src --include="*.ts"
grep -r ": any\|as any" /path/src --include="*.ts"

# Analyze structure
tree -L 3 /path
ls -lah /path/src/
du -sh /path/src
```

### Analysis Techniques

#### 1. Pattern Matching
Search for common patterns to identify:
- Shell commands: `\$\|\`.*\`|exec|spawn`
- File I/O: `fs\.|readFile|writeFile`
- API calls: `fetch|http|request`
- Error suppression: `catch.*{.*}`
- God objects: interfaces/classes with 15+ properties

#### 2. Dependency Analysis
Understanding what imports exist reveals coupling:
```bash
grep -r "^import" /path/src | sort | uniq -c | sort -rn
```

#### 3. Naming Analysis
Consistent naming indicates good organization:
- File names match exports?
- Functions follow same verb pattern?
- Interfaces follow naming convention?
- Test files follow naming pattern?

#### 4. Size Analysis
Large files often indicate mixed concerns:
```bash
find /path -name "*.ts" -exec wc -l {} + | sort -rn | head -20
```

Files >300 lines should be questioned for single responsibility.

#### 5. Test Ratio Analysis
Generally: test code should be 1.5-2x source code:
```bash
source_lines=$(find /path/src -name "*.ts" ! -path "*__tests__*" | xargs wc -l | tail -1 | awk '{print $1}')
test_lines=$(find /path/src -name "*.test.ts" | xargs wc -l | tail -1 | awk '{print $1}')
echo "Test ratio: $test_lines / $source_lines"
```

Ratio <1.0 suggests insufficient testing.

---

## Complete Example

### Example: Reviewing a CLI Package

#### Plan
- Size: 23 source files, 2,943 lines
- Risk: Entry point, complexity
- Decision: Full review (high criticality)

#### Step 1: Read All Source
```bash
find /path/packages/cli/src -name "*.ts" ! -path "*__tests__*" \
  | sort | while read f; do \
    echo "=== $(basename $f) ==="; \
    cat "$f"; \
    echo ""; \
  done | head -c 200000
```

#### Step 2: Document Observations
- 10 command files with similar registration pattern (95% duplication)
- IServices interface has 22 properties (god object)
- Comprehensive logging with SafeLogMessageMap
- 18 test files with good coverage
- No critical security issues
- Good type safety throughout

#### Step 3: Identify Issues

**High Priority:**
- Command registration boilerplate (~200 lines of duplication)
- IServices should be split by concern
- Some missing integration tests

**Medium Priority:**
- Similar log messages could be consolidated
- Test helper naming inconsistency

#### Step 4: Write Review
Create review-cli.md with:
- Overview (purpose, size, architecture)
- Code quality analysis per command type
- Duplication analysis (registration pattern)
- Test analysis
- Issues with severity levels
- Recommendations
- Grade: A- (excellent but with improvements possible)

#### Step 5: Create Summary Entry
```markdown
### ✅ 5. cli - EXCELLENT (A-)
- **Files:** 23 source + 18 test files (2,943 lines)
- **Status:** Production-ready
- **Grade: A-** - Well-organized commands, excellent logging
- **Minor Issues:** Service god-object (22 properties), command boilerplate
```

---

## Best Practices Learned

### DO ✅

1. **Read Complete Source**
   - Never sample or pattern-match
   - Read all files in a package together
   - This reveals duplication you'd miss individually

2. **Document with Examples**
   - Include actual code snippets
   - Show GOOD and BAD patterns
   - Don't just say "this is bad" - show why

3. **Provide Actionable Recommendations**
   - "Extract helper function" (vague)
   - "Extract `cleanupTempFiles()` to `src/helpers/cleanup.ts`, then re-export from both `steps/` and `helpers/`" (actionable)

4. **Use Severity Levels**
   - Color code issues (🔴 🟠 🟡)
   - Separate blocking from nice-to-have
   - Help stakeholders prioritize

5. **Create Index Documents**
   - Summary of all findings
   - Navigation between detailed reviews
   - Executive summary with grades

6. **Be Specific About Duplication**
   - Don't just say "duplication exists"
   - Show which files/functions have it
   - Estimate lines that could be saved

### DON'T ❌

1. **Sample Code**
   - "Looks good" isn't analysis
   - Must read all files
   - Patterns hide duplication

2. **Be Vague**
   - "Code could be better" (what specifically?)
   - "Consider refactoring" (to what?)
   - Always provide concrete examples

3. **Miss Duplication**
   - Duplication hides in similar-but-different code
   - Look for patterns like:
     - Same logic, different variable names
     - Copy-paste with minor changes
     - Repeated error handling patterns

4. **Ignore Tests**
   - Tests reveal gaps in coverage
   - Test file organization shows structure
   - Count of tests indicates maturity

5. **Skip Security Analysis**
   - Always look for:
     - Shell command construction
     - File path handling
     - External API calls
     - Input validation

---

## Checklist for Reviewers

Before completing a code review, verify:

- [ ] All source files in package have been read (no sampling)
- [ ] Test files have been analyzed
- [ ] File structure and organization documented
- [ ] Duplication identified with specific examples
- [ ] Issues categorized by severity (Critical/High/Medium/Low)
- [ ] Recommendations are actionable (not vague)
- [ ] Code examples included for all major findings
- [ ] Grade assigned with rubric justification
- [ ] Summary document created for this package
- [ ] Added to master index with all other packages
- [ ] Review follows consistent format across all packages

---

## Summary

Comprehensive code reviews require:
1. **Planning:** Identify what to review and at what depth
2. **Methodology:** Use full-source or quick assessment based on risk
3. **Analysis:** Check across 8+ dimensions of code quality
4. **Documentation:** Write clear, actionable findings with examples
5. **Grading:** Assign grades based on consistent rubric
6. **Prioritization:** Separate critical from nice-to-have issues
7. **Navigation:** Create index documents for easy access

The result is a complete understanding of codebase health with clear guidance on improvements needed.

