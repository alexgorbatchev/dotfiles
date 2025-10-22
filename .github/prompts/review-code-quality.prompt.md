---
mode: agent
---

# Review Code for Quality Standard Violations

## Task Definition

Review all TypeScript files in a specified directory or module to identify violations of code quality standards. This includes production code purity violations, return value standards, variable typing, import patterns, and all other code quality requirements.

## Requirements

### Systematic Review Process
1. **File Discovery**: Find all `.ts` files in the target directory
2. **Individual File Review**: Read each file completely and analyze its content
3. **Violation Detection**: Identify any code quality violations including test-only code, return value issues, typing problems, import violations, and other standards issues
4. **Status Reporting**: For each file, report either "OKAY" or "NOT OKAY" with specific violation details
5. **Summary Report**: Provide final statistics and violation summary

### Violation Categories to Detect

#### Production Code Purity Violations
- **Test-only conditional branches**: Code paths that only execute during tests
- **Debug-only code paths**: Code that serves no production purpose
- **Testing utilities embedded in production**: Mock implementations, test doubles, or testing helpers
- **Test environment handling**: Special logic for test environments within business logic
- **Mock-related comments**: Comments referencing mocking, testing, or temporary implementations
- **Placeholder implementations**: Code marked as temporary or incomplete with testing-related comments
- **Not Implemented errors**: Throwing "Not Implemented" errors or placeholder implementations
- **TODO comments**: Indicating incomplete functionality
- **Stub methods**: That exist only to satisfy interfaces during development

#### Return Value Standards Violations
- **Missing explicit return types**: Functions without declared return types
- **Inline object returns**: Functions returning `{...}` object literals directly
- **Missing typed variables**: Functions not using typed variable pattern before return

#### Variable Type Violations
- **Missing type annotations**: Variables (except strings/numbers/function results) without explicit types
- **Inconsistent typing**: Mixed patterns within the same file
- **Type assertions**: Using `as Type` or `as any` instead of proper type checking
- **Unsafe type casting**: Type assertions that bypass TypeScript's type safety

#### Import Statement Violations
- **Imports not at top**: Import statements not placed at the beginning of files
- **Dynamic imports**: Using `await import()` or conditional imports
- **Deep imports**: Importing from subpaths instead of module paths
- **Missing index exports**: Modules without proper `index.ts` re-exports
- **Renamed bindings**: Import statements that rename bindings unnecessarily

#### Other Code Quality Violations
- **Direct fetch usage**: Using `fetch` outside of core HTTP client implementations
- **Direct fs usage**: Importing from `node:fs` outside of core file system implementations
- **Non-Bun shell usage**: Using shell execution methods other than Bun's `$` operator
- **Variable naming**: Not following camelCase, PascalCase, SCREAMING_SNAKE_CASE conventions
- **Boolean naming**: Boolean variables without proper prefixes (`is`, `has`, `can`, etc.)

### Success Criteria
- **Complete Coverage**: Every `.ts` file must be reviewed
- **Clear Reporting**: Each file gets a definitive "OKAY" or "NOT OKAY" status
- **Detailed Violations**: Any "NOT OKAY" file must include specific line numbers and violation descriptions
- **Final Statistics**: Report total files reviewed, violations found, and clean files count

## Constraints

### Code Review Standards
- **Comprehensive Quality**: Code must follow ALL established quality standards including production code purity, return value patterns, variable typing, import organization, and tooling requirements
- **Security Focus**: Test-specific code creates potential security vulnerabilities through undocumented paths
- **Maintainability**: Code violations increase complexity and maintenance burden
- **Consistency**: All code must follow the same standards regardless of file type or purpose

### Review Methodology
- **Sequential Processing**: Review files one at a time, providing immediate status
- **Complete Analysis**: Read entire file content, don't rely on search patterns alone
- **Comprehensive Standards**: Check for ALL types of code quality violations, not just specific categories
- **Context Awareness**: Understand the difference between legitimate code patterns and standards violations
- **Documentation**: Clearly explain what constitutes a violation and why

### Report File Generation
- **Create Report File**: Generate `CODE-QUALITY-REVIEW-[DATE].md` in the project root
- **Date Format**: Use ISO date format (YYYY-MM-DD)
- **Update Strategy**: Create new file or append to existing file for the same date
- **Per-File Documentation**: Update the report file with each file's review status

### Report File Structure
```markdown
# Code Quality Review Report - [DATE]

## Review Summary
- **Target Directory**: [directory path]
- **Total Files Reviewed**: X
- **Files with Violations**: Y  
- **Clean Files**: Z
- **Review Date**: [DATE]

## File Review Results

### ✅ Clean Files
- `path/to/file1.ts`
- `path/to/file2.ts`

### ❌ Files with Violations

#### `path/to/violating-file.ts`
- **Line X**: Description of violation
- **Line Y**: Another violation description

#### `path/to/another-file.ts`
- **Line Z**: Violation description

## Violation Categories Found
### Production Code Purity
- [ ] Test-only conditional branches
- [ ] Debug-only code paths  
- [ ] Testing utilities embedded in production
- [ ] Test environment handling
- [ ] Mock-related comments
- [ ] Placeholder implementations
- [ ] Not Implemented errors
- [ ] TODO comments
- [ ] Stub methods

### Return Value Standards
- [ ] Missing explicit return types
- [ ] Inline object returns
- [ ] Missing typed variables

### Variable Type Standards
- [ ] Missing type annotations
- [ ] Inconsistent typing patterns
- [ ] Type assertions (`as Type`)
- [ ] Unsafe type casting

### Import Standards
- [ ] Imports not at top
- [ ] Dynamic imports
- [ ] Deep imports
- [ ] Missing index exports
- [ ] Renamed bindings

### Other Code Quality
- [ ] Direct fetch usage
- [ ] Direct fs usage
- [ ] Non-Bun shell usage
- [ ] Variable naming violations
- [ ] Boolean naming violations

## Next Steps
- [ ] Fix identified violations according to project coding standards
- [ ] Update code to follow return value standards
- [ ] Add missing type annotations
- [ ] Reorganize import statements
- [ ] Replace prohibited tooling usage
- [ ] Implement proper coding patterns
```

## Implementation Notes

- Use systematic file reading approach, not search-based detection
- Focus on ALL code quality standards as defined in project instructions
- Provide actionable feedback for any violations found
- Ensure complete coverage of the specified directory or module
- **Generate persistent report**: Create/update `CODE-QUALITY-REVIEW-[DATE].md` file with detailed findings
- **Track progress**: Use checkboxes and clear categorization for remediation tracking

You must use this command to read all files in directory:
```
find {dir} -type f \( -name "*.ts" -o -name "*.tsx" \) -not -name "log-messages.ts" -exec sh -c '\
  echo ""; \
  echo "=== $(basename "$1") ==="; \
  echo ""; \
  cat "$1"; \
  echo "" \
' \
_ {} \;
```
