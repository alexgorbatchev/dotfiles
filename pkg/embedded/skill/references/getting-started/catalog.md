---
created_on: 2026-10-07 09:59
last_modified: 2026-10-07 09:59
status: current
---

# Catalog definitions

Use the catalog to discover shared tool definitions and inspect their source. Supply the static catalog directory URL with `--catalog-url`. The URL must use HTTPS, end with `/`, and contain no credentials, query or fragment. Set `CATALOG_URL` in these shell examples to your catalog directory URL.

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

## Outdated

## Completion and failures

Catalog ID, variant and category completion uses validated cached discovery data without network requests. Missing cache yields no suggestions and suppresses filesystem completion.

Successful data goes to stdout. Top-level JSON failures emit `schemaVersion`, `code`, `message`, `id` and `retryable` to stderr and return exit 1. Invalid arguments/options use `invalid-input`; unknown IDs/variants use `not-found`; missing offline objects use `cache-missing`; failed static requests use `network-failed`; invalid object content uses `integrity-failed` or `unsupported-schema`. Human mode shows formatted output; agent mode shows compact records. Discovery never prompts.
