# Critical Issues Report

**Last Updated:** December 19, 2025  
**Severity:** 🔴 CRITICAL BLOCKING ISSUES

---

## Issue Severity Levels

- 🔴 **CRITICAL:** Security vulnerabilities, data loss risk, system instability
- 🟠 **HIGH:** Architecture issues, significant code duplication, test gaps
- 🟡 **MEDIUM:** Design improvements, minor duplication

---

## Critical Issues by Package

### 🔴 archive-extractor

#### Issue 1: Shell Injection Vulnerability
**Location:** `packages/archive-extractor/src/ArchiveExtractor.ts`  
**Severity:** CRITICAL  
**Description:** Command construction uses string concatenation with basic quote escaping, vulnerable to shell injection if paths contain single quotes or special characters.

**Vulnerable Code:**
```typescript
`tar -xzf '${archivePath}' -C '${tempExtractDir}'`
```

**Risk:** Arbitrary command execution with attacker-controlled archive paths

**Fix:** Use `execFile()` or Bun's `$` operator with proper parameter passing (not string interpolation)

**Example Fix:**
```typescript
await $`tar -xzf ${archivePath} -C ${tempExtractDir}`;
```

---

#### Issue 2: Random Suffix Collision Risk
**Location:** `packages/archive-extractor/src/ArchiveExtractor.ts`  
**Severity:** CRITICAL  
**Description:** Uses random suffix for temp directories with only ~10,000 possible values.

**Problem:**
```typescript
const suffix = Math.random().toString(36).slice(2, 8);
// Only gives 36^6 ≈ 2,176,782,336 possible values
// But actual entropy much lower; high collision risk with multiple concurrent extractions
```

**Risk:** Directory collision between concurrent operations, leading to data loss or security issues

**Fix:** Use UUID4 for guaranteed uniqueness:
```typescript
const tempExtractDir = join(tempDir, `extract-${randomUUID()}`);
```

---

### 🔴 build

#### Issue 1: Duplicate `cleanupTempFiles()` Function
**Location:** Two separate files  
- `packages/build/src/steps/index.ts`
- `packages/build/src/helpers/index.ts`

**Severity:** CRITICAL  
**Description:** Identical function implemented in two different modules. Bug fixes must be made in both places.

**Impact:** Maintenance nightmare, diverging behavior between modules, increased bug risk

**Fix:** Consolidate into single location, re-export from both modules

---

#### Issue 2: Minimal Test Coverage
**Location:** `packages/build/src/__tests__/`  
**Severity:** CRITICAL  
**Description:** Only 2 test cases for a 50+ file, 987 line system that orchestrates:
- CLI bundling
- Schema generation
- Type testing
- Publishing workflows

**Impact:** High regression risk, difficult to refactor with confidence

**Fix:** Create comprehensive test suite covering:
- [ ] Each build step independently
- [ ] Error scenarios and recovery
- [ ] File system operations
- [ ] Integration between steps

**Estimate:** 50+ test cases needed for adequate coverage

---

## Packages Requiring Full Review Before Using

- ✅ **arch** - Safe, no critical issues
- ⛔ **archive-extractor** - DO NOT USE until shell injection fixed
- ⛔ **build** - Use with caution; refactoring recommended
- ✅ **downloader** - Safe, no critical issues
- ✅ **cli** - Safe, no critical issues (medium: service god-object, boilerplate)
- 🟡 **config** - Safe with 1 abstraction violation (tsConfigLoader uses raw fs instead of IFileSystem)

---

## Summary

**Total Critical Issues:** 3  
**Blocking Issues:** 3  
**Packages Affected:** 2 of 6 reviewed  
**Abstraction Violations:** 1 (config package)

### Action Items

1. **Immediate (Before Next Deployment):**
   - [ ] Fix shell injection in archive-extractor
   - [ ] Fix UUID collision in archive-extractor
   - [ ] Consolidate duplicate cleanupTempFiles() in build

2. **High Priority (This Sprint):**
   - [ ] Add test coverage to build package (minimum 30 test cases)

3. **Continue with:**
   - Review remaining 23 packages for additional critical issues
