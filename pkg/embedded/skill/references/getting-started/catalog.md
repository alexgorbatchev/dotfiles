---
created_on: 2026-10-07 09:59
last_modified: 2026-10-11 12:32
status: current
---

# Catalog definitions

Use `catalog fetch` to retrieve editable tool files from a Git repository. Search, list and show are separate discovery commands that consume a static catalog snapshot.

## Fetch

```bash
dotfiles catalog fetch bat
DOTFILES_CATALOG_REPO="$CATALOG_REPOSITORY" dotfiles catalog fetch bat
dotfiles --config ./dotfiles.config.ts catalog fetch bat --repo "$CATALOG_REPOSITORY" --ref main --json
dotfiles catalog fetch bat --repo "$CATALOG_REPOSITORY" --dry-run
```

`catalog fetch <id>` requires exactly one lowercase catalog ID. The repository defaults to `https://github.com/alexgorbatchev/dotfiles-catalog`. A nonempty `DOTFILES_CATALOG_REPO` environment variable changes that repository for fetch; explicit `--repo` takes precedence over the environment and built-in default. An unset or empty environment variable uses the built-in default. An explicitly empty `--repo` is invalid.

The remote tool directory is `tools/<first-character>/<second-character>/<id>/`; one-character IDs use `_` for the second component. The directory must contain `tool.ts`. Fetch copies its regular files, including helpers, assets and metadata, into `<primary-tool-configs-dir>/<id>/` and renames `tool.ts` to `<id>.tool.ts`. File contents and Git executable intent are preserved; Windows uses its native file permissions. Symlinks, submodules, additional `*.tool.ts` files, unsafe names and case-insensitive path collisions are refused. The directory is limited to 256 files, 20 MiB total, 256 KiB for `tool.ts` and 5 MiB for each other file.

| Option                | Behavior                                                                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--repo <repository>` | Optional HTTPS, SSH or `file:` Git URL, or absolute local repository path; overrides the environment and default above. URL queries, fragments, passwords and API endpoints are refused. SSH URLs may contain a username. |
| `--ref <ref>`         | One branch, tag or commit; omitted means remote `HEAD`. Git pins the resolved commit before reading files.                                                                                                                |
| `--json`              | Emit `id`, `repository`, `commit`, `sourcePath`, `destination`, `files` and `dryRun` to stdout, compact in agent mode.                                                                                                    |
| `--dry-run`           | Retrieve and validate using temporary Git storage, then remove the scratch files without importing files or populating discovery caches.                                                                                  |
| `--config <path>`     | Existing local `.ts` or `.js` project configuration; defaults to `dotfiles.config.ts` in the working directory. The first resolved tool directory is the destination root.                                                |

Git must be installed. Fetch evaluates the local project configuration to resolve paths, without scanning existing tool definitions or opening the installation registry. It never evaluates fetched source, installs software, runs tool hooks, generates shims or applies tool configuration. Review the downloaded files before running generation or installation through the normal workflow.

Existing destination files, directories and symlinks are refused; there is no overwrite flag, update tracking or automatic merging. Fetch never prompts. Human status goes to stderr; JSON success goes to stdout. Failures return exit 1 and use the [catalog error envelope](#completion-and-failures); retrieval additionally reports `destination-exists`. Avoid concurrent edits to the destination or its parent directories during fetch. This is an initial file import, without crash-recovery journals; an interrupted import can require manual removal of its incomplete destination before retrying.

Temporary Git storage lives beneath `.tmp/` next to the project configuration and is removed on normal success or failure. The destination and scratch ancestors must be real directories. Git reads object bytes without checkout filters or repository hooks, and follows no HTTP redirects. Fetch uses isolated Git configuration and does not inherit `GIT_*` settings or Git credential helpers; private access can use an SSH URL with an already configured SSH agent/key and known host. SSH runs in batch mode with strict host-key checking. A one-minute deadline covers the Git retrieval. Blob filtering requests selected file contents on demand when the server supports it; servers that ignore filtering can transfer additional objects.

`--catalog-url`, `--offline` and `--refresh` are discovery options and are rejected by fetch. The external publishing process owns preparing the Git repository; this command requires no website or generated static snapshot.

## Discovery

Supply the static catalog directory URL with `--catalog-url` for discovery. The URL must use HTTPS, end with `/`, and contain no credentials, query or fragment. Set `CATALOG_URL` in these shell examples to your catalog directory URL.

- [Shared catalog options](#shared-catalog-options)
- [Search and list](#search-and-list)
- [Show](#show)
- [Completion and failures](#completion-and-failures)

```bash
dotfiles catalog search "file viewer" --catalog-url "$CATALOG_URL"
dotfiles catalog list --catalog-url "$CATALOG_URL" --category terminal
dotfiles catalog show bat --catalog-url "$CATALOG_URL"
```

Search, list and show read catalog data without loading the selected project configuration. They do not install software or execute downloaded source. `--config` has no effect on discovery.

## Shared catalog options

| Option                | Behavior                                                                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `--catalog-url <url>` | Static catalog directory; required when no official origin is configured.                                                                    |
| `--offline`           | Read validated cached catalog data without network requests. Missing objects fail with `cache-missing`. Current remote freshness is unknown. |
| `--refresh`           | Revalidate the publication pointer now. Cannot be combined with `--offline`.                                                                 |
| `--json`              | Emit the typed result to stdout. Human mode uses indented JSON; `AGENT=1` uses one compact line.                                             |

Existing [global CLI options](cli-reference.md#global-flags), including logging, target selection and `--dry-run`, remain available. Dry runs do not write catalog cache data. Normal discovery may populate the user cache; it does not write project state.

Search, list and show reuse a validated snapshot retrieved within the last hour. An online discovery request that fails may show a validated cached snapshot with a stale warning. Every result identifies its origin, snapshot, generation time and offline/stale status. Warnings and errors go to stderr through the logger.

## Search and list

`catalog search <query>` requires exactly one argument. Quote multiword queries. Queries contain 1–200 characters after trimming. Search folds ASCII letter case and whitespace, then requires every word to occur in the ID, display name or description. Matches rank by exact ID, ID prefix, ID substring, display name and description; ties sort by ID.

`catalog list` takes no arguments and sorts entries by ID.

| Option                           | Behavior                                                                 |
| -------------------------------- | ------------------------------------------------------------------------ |
| `--category <id>`                | Repeatable category filter. Unknown IDs are input errors.                |
| `--method <name>`                | Repeatable installation-method filter. Unknown methods are input errors. |
| `--page <integer>`               | Page starting at 1; default 1.                                           |
| `--limit <integer>`              | 1–100 results; search defaults to 20 and list to 50.                     |
| `--platform`, `--arch`, `--libc` | Filter supported targets only when explicitly supplied.                  |

Repeated values within one filter match any selected value; different filters must all match. A method and target must belong to the same definition's target summary. Results name matching definitions. A page beyond the last result is empty and retains the actual total. No matches exit successfully.

JSON search/list results contain the shared context plus `query`, `page`, `limit`, `total`, `hasNextPage` and `items`. Each item contains the index entry and its `matchingDefinitions`.

## Show

`catalog show <tool>` requires an exact catalog ID. `--variant <name>` selects one definition, defaulting to `default`. The command fetches that definition's manifest and selected files, and returns metadata, the variant list, summaries, verification, exact main source and the asset file listing. It does not download unselected definitions.

Explicit target flags select the first supported target matching those fields as `preferredTarget`. With no target flags, or with no supported match, this field is null; the complete supported target matrix remains visible. An unknown ID or variant returns `not-found`.

The JSON result contains the shared context, `detail`, `selectedDefinition`, `definitionSource` and `preferredTarget`.

Formatted terminal output displays control characters as escapes while preserving source line breaks and indentation. JSON retains the exact source contents.

## Completion and failures

Discovery ID, variant and category completion uses validated cached discovery data without network requests. Missing cache yields no suggestions and suppresses filesystem completion. Fetch suppresses filesystem completion without querying a repository.

Successful data goes to stdout. Top-level JSON failures emit `schemaVersion`, `code`, `message`, `id` and `retryable` to stderr and return exit 1. Invalid arguments/options use `invalid-input`; unknown IDs/variants use `not-found`; missing offline objects use `cache-missing`; failed static requests use `network-failed`; invalid object content uses `integrity-failed` or `unsupported-schema`. Human mode shows formatted output; agent mode shows compact records. Discovery never prompts.
