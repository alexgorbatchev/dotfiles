---
targets:
  - '*'
description: >-
  Fully refresh project documentation based on README.md files in source
  directories.
copilot:
  agent: agent
---

We have to clean up the docs as they have gotten stale, we will do this one file at a time:

# Setup

- List all files in the `docs/` folder using the CLI.
- If `docs/REVIEW.md` exists, read it and proceed to the Review section.
- If `docs/REVIEW.md` does not exist, populate it with the checklist of files from the previous step.

# Review

- Focus on one file at a time from the checklist in `docs/REVIEW.md`.
- Identify which package or feature it documents.
- If all files have been reviewed, inform the user and wait for further instructions.
- For every identified package or feature, read its README.md in full, no sampling.
- README.md files in the source directories are the source of truth for documentation.
- README.md files ARE NOT exposed to end users, they are for internal use only.
- You may conclude that some files in `docs/` are obsolete and should be deleted. In that case, mark them for deletion in `docs/REVIEW.md`, but do not delete.

# Scope

- The docs are for end users of the project.
- They do not have access to the internal types and they should not be mentioned.
- The main point of entry into the project is the CLI and defineTool API.
- The project is published as a single package on npm called @gitea/dotfiles.
- Public API surface is defined in packages/cli/src/schema-exports.ts, if a type is not exported there, it is not public AND should not be mentioned in the documentation by name.

# Output

- We are aiming for clear, concise, and user-friendly documentation.
- Our end users are developers who want to use the project effectively.
- Avoid repeating the same examples multiple times, users don't want to have to read the same content repeatedly.
- Examples should be concise and to the point.
- Examples should build on each other, starting from the simplest possible example to more complex ones.
- Information is not repeated in multiple places, instead, it is referenced.

# When done

- List EVERY file that was reviewed as a sub item under the main item for the file you just updated in `docs/REVIEW.md`.
- Review all other files in `docs/` and compare them to the file you just updated. For each file that contains overlapping information, add a sub item in `docs/REVIEW.md` referring to duplicates and that they should be considered for removal.
- After completing each file, update the corresponding entry in `docs/REVIEW.md` to indicate completion.
- Tell the user which file you have completed and wait for confirmation before proceeding to the next file.

**CRITICAL**: DO NOT USE FILES IN `docs/` AS YOUR SOURCE OF CONTEXT FOR THIS WORK. ALWAYS USE THE README.md FILES IN THE SOURCE DIRECTORIES AS THE SOURCE OF TRUTH.
