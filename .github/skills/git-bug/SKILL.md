---
name: git-bug
description: git-bug issue tracking embedded in git. Use when managing bugs/issues, creating tickets, listing issues, or working with the git-bug tool. Covers creating bugs, pushing/pulling bug refs, and configuring git for automatic sync.
---

# Git-Bug

Distributed bug tracking embedded in git using custom refs.

## Binary Location

```
/Users/alex/.local/share/zinit/plugins/git-bug---git-bug/git-bug
```

## Quick Reference

### Create Issue

```bash
git-bug bug new --non-interactive -t "Title" -m "Description"
```

### List Issues

```bash
git-bug bug
git-bug bug --status open
git-bug bug --status closed
```

## Search Filters

Use qualifiers to filter and sort issues. All queries are case insensitive and can be combined.

### Filter Examples

```bash
git-bug bug status:open                      # Open issues only
git-bug bug status:closed                    # Closed issues only
git-bug bug author:alex                      # By author name
git-bug bug label:urgent                     # By label
git-bug bug title:installer                  # By title content
git-bug bug no:label                         # Issues without labels
git-bug bug status:open sort:edit            # Combined filters
```

### Available Filters

| Qualifier           | Description                           |
| ------------------- | ------------------------------------- |
| `status:open`       | Open issues                           |
| `status:closed`     | Closed issues                         |
| `author:QUERY`      | Issues opened by user                 |
| `participant:QUERY` | Issues where user opened or commented |
| `actor:QUERY`       | Issues where user had any interaction |
| `label:LABEL`       | Issues with specific label            |
| `title:TITLE`       | Issues with title containing text     |
| `no:label`          | Issues without any labels             |

### Sorting

| Qualifier           | Description                   |
| ------------------- | ----------------------------- |
| `sort:id-desc`      | By ID, descending (default)   |
| `sort:id-asc`       | By ID, ascending              |
| `sort:creation`     | By creation time, descending  |
| `sort:creation-asc` | By creation time, ascending   |
| `sort:edit`         | By last edit time, descending |
| `sort:edit-asc`     | By last edit time, ascending  |

**Note**: Wrap values with spaces in quotes: `author:"René Descartes"`

### Show Issue Details

```bash
git-bug bug show <issue-id>
```

### Close Issue

```bash
git-bug bug status close <issue-id>
```

### Add Comment

```bash
git-bug bug comment add <issue-id> -m "Comment text"
```

## Data Storage

Git-bug stores data as git refs under `refs/bugs/*`. Each bug is a git object.

```bash
git show-ref | grep bug  # List all bug refs
```

## Sync Configuration

Git-bug's built-in push/pull may fail with HTTPS remotes due to auth issues. Configure git to sync bugs automatically:

```bash
# Add fetch refspec
git config --local --add remote.origin.fetch '+refs/bugs/*:refs/bugs/*'

# Add push refspec  
git config --local --add remote.origin.push '+refs/bugs/*:refs/bugs/*'
```

After configuration:

- `git pull` / `git fetch` → fetches bugs
- `git push` → pushes bugs

### Manual Sync

```bash
# Push bugs
git push origin 'refs/bugs/*:refs/bugs/*'

# Fetch bugs
git fetch origin 'refs/bugs/*:refs/bugs/*'
```

## Creating Well-Structured Issues

Issues can be bugs, new features, or changes. Regardless of type, gather context before filing.

### Gather Context First

Before filing a new issue, ensure you have sufficient context:

1. **Search existing issues** - Check if it already exists
   ```bash
   git-bug bug                    # List all open issues
   git-bug bug --status closed    # Check closed issues too
   ```

2. **Understand the source** - If you don't already have context:
   - Read the relevant source files to understand current behavior
   - Identify the specific component/package affected
   - Trace the code path involved
   - Note the exact file paths and line numbers if applicable

3. **Validate the issue**:
   - **For bugs**: Reproduce the problem, capture actual vs expected output
   - **For features**: Verify the feature doesn't already exist, understand related functionality
   - **For changes**: Review current implementation to understand what needs modification

4. **Identify scope** - Determine what's affected:
   - Which packages/modules are involved
   - Are there related tests that should be updated
   - Is documentation affected

### Issue Templates

For multi-line descriptions, write content to a temp file and read from it:

**Bug:**

```bash
cat > /tmp/issue.md << 'ISSUE'
**Current behavior:** What happens now

**Expected behavior:** What should happen

**Steps to reproduce:** How to trigger the issue

**Files:** path/to/relevant/file.ts
ISSUE

git-bug bug new --non-interactive \
  -t "fix(component): Short description" \
  -m "$(cat /tmp/issue.md)"

rm /tmp/issue.md
```

**Feature:**

```bash
cat > /tmp/issue.md << 'ISSUE'
**Goal:** What this feature should accomplish

**Proposed implementation:** How it could work

**Files:** path/to/relevant/file.ts
ISSUE

git-bug bug new --non-interactive \
  -t "feat(component): Short description" \
  -m "$(cat /tmp/issue.md)"

rm /tmp/issue.md
```

**Change/Refactor:**

```bash
cat > /tmp/issue.md << 'ISSUE'
**Current state:** What exists now

**Proposed change:** What needs modification

**Reason:** Why this change is needed

**Files:** path/to/relevant/file.ts
ISSUE

git-bug bug new --non-interactive \
  -t "refactor(component): Short description" \
  -m "$(cat /tmp/issue.md)"

rm /tmp/issue.md
```

## Issue Resolution Workflow

When working on an issue from the tracker, follow this workflow:

### 1. Select and Understand Issue

```bash
git-bug bug                      # List open issues
git-bug bug show <issue-id>      # Read full details
```

Understand the issue before writing code.

### 2. Verify Issue

- **For bugs**: Reproduce locally, confirm the problem exists
- **For features**: Verify requirements are clear and feature doesn't already exist
- **For changes**: Understand current implementation and why change is needed
- If unclear, add comment to issue requesting clarification

### 3. Write Tests

- **For bugs**: Write a failing test that reproduces the issue
- **For features**: Write tests that define expected behavior
- **For changes**: Update existing tests or add new ones as needed
- Tests must pass after implementation

### 4. Implement Solution

- Address the root cause or requirement identified in the issue
- Keep changes minimal and focused
- Run `bun test` to verify implementation

### 5. Update Documentation

If the fix changes behavior or adds features, update:

1. **Package README** - `packages/<pkg>/README.md`
2. **User docs** - `docs/*.md` (API reference, guides)
3. **Tool prompt** - `docs/prompts/make-tool.prompt.md` (if tool config API changed)

### 6. Commit Changes

Use conventional commit prefix matching the issue type:

```bash
git add -A
git commit \
  -m "<type>(<component>): <short description of what changed>" \
  -m "<detailed explanation of what was done and why>

Issue: <issue-id>"
```

Commit types: `fix` (bugs), `feat` (features), `refactor` (changes)

Example:

```bash
git commit \
  -m "fix(installer): handle missing binary path in extraction" \
  -m "Added null check for binary path before attempting symlink creation.
The extractor now validates paths exist before proceeding.

Issue: 7f34a2b"
```

### 7. Close Issue

```bash
git-bug bug status close <issue-id>
git-bug bug comment add <issue-id> -m "Completed in commit $(git rev-parse --short HEAD)"
```

### 8. Push Everything

```bash
git push  # Pushes code and bugs (if configured)
```
