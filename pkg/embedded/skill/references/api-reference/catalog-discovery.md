---
created_on: 2026-10-07 09:59
last_modified: 2026-10-07 09:59
status: current
---

# Catalog discovery Go API

`github.com/alexgorbatchev/dotfiles/pkg/catalog` owns the schema-1 static protocol and discovery client. The [CLI reference](../getting-started/catalog.md) describes user commands and output. This package does not evaluate or install definitions.

## Client

`NewClient(ClientOptions) (*Client, error)` validates an absolute static HTTPS directory origin. `ClientOptions` accepts `Origin`, optional `FS` (the installer filesystem), `CacheDir`, `HTTPClient`, `Logger` and `Now`. Defaults use the OS filesystem, user cache directory, default HTTP client and current time. The origin hashes into its own cache namespace. `AllowLoopbackHTTP` permits only numeric loopback HTTP origins for fixtures; normal CLI origins remain HTTPS.

`Client.Discover(ctx, RequestOptions) (DiscoverySnapshot, error)` reads the pointer and validated shared snapshot objects. `RequestOptions` has `Offline`, `Refresh`, `DryRun`, and `RequireFresh` booleans. Offline plus refresh is invalid. Dry runs avoid cache writes. RequireFresh forces an online revalidation and disallows stale fallback. Ordinary discovery reuses a valid cache retrieved within an hour, or permits validated stale data after a network failure.

`DiscoverySnapshot` contains `ResultContext`, `Payload`, `Index`, `Categories`, and `Tombstones`. `ResultContext` contains schema version, origin, snapshot hash, generation timestamp and offline/stale flags. A successful download validates hashes and lengths before interpreting data, and recomputes verification freshness for display.

`Client.Definition(ctx, snapshot, id, name, options) (DefinitionBundle, error)` selects an exact ID and variant from one snapshot, then fetches its detail, manifest and selected files. `DefinitionBundle` contains `Detail`, `Manifest` and `Files` indexed by bundle path. Cross-checks bind source commit/path, metadata, variant identity/revision, minimum CLI version, target/method projections and text classification. It never executes source or downloads other variants.

`Error` implements `error` and `Unwrap`, with public `SchemaVersion`, `Code`, `Message`, nullable `ID` and `Retryable`. Codes identify invalid input, missing IDs/variants, cache absence, static request failures, integrity failures and unsupported schemas. Context cancellation remains available through `errors.Is`.

## Queries

`Query(index, categories, QueryOptions) (QueryResult, error)` applies deterministic ranking, filtering and pagination. `QueryOptions` contains nullable `Query`, `Filters`, `Page`, `Limit`, and `Now`. Zero page chooses 1; zero limit chooses 20 for search and 50 for list. Explicit pages must be positive and limits must be 1–100.

`QueryFilters` contains `Categories`, `Methods`, and nullable `Platform`, `Architecture`, `Libc`. Its `Validate(CategoryRegistry) error` rejects unknown values. Methods come from the installer's maintained vocabulary. Filters must match within the same definition/target summary.

`QueryResult` contains normalized nullable query, page, limit, total, has-next-page flag and `Items`. Each `DiscoveryItem` contains `Entry` and `MatchingDefinitions`. Empty results retain an empty array and the actual total.

`VerificationStatus([]IndexDefinition, now) string` computes `verified`, `partial`, `failed`, `stale` or `unverified` from recorded target checks. Successful checks are fresh through an inclusive 30-day boundary; future timestamps do not establish freshness. Empty history is unverified.

## Wire types and validation

All wire objects use explicit JSON identities. Arrays are required and nonnull; pointer fields are required but nullable. `Decode[T]([]byte) (T, error)` rejects unknown/duplicate/case-alias properties, omitted fields, invalid UTF-8, excessive nesting, unsupported reflected shapes and noninteger numbers before decoding. `CanonicalJSON(any) ([]byte, error)` emits sorted ASCII object keys without changing array order, returning errors for unsupported data.

`Blob([]byte) BlobRef` records exact SHA-256 and byte length. `BlobRef.Verify([]byte) error` checks both; `BlobRef.Validate(limit) error` checks its representation and optional positive bound. `IsText([]byte) bool` requires UTF-8 without NUL. Asset encodings and line endings stay unchanged.

`ValidateID(string) error` enforces portable lowercase IDs. `SourcePath(id) (string, error)` maps IDs into `tools/<first>/<second-or-_>/<id>`.

| Type                                         | Content and validation                                                                                                                                                                                           |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Target`                                     | Platform, architecture and libc. `Validate()` accepts Linux GNU/musl and non-Linux unknown libc for macOS/Windows, on amd64/arm64.                                                                               |
| `Maintainer`                                 | GitHub handle.                                                                                                                                                                                                   |
| `DefinitionMetadata`                         | Variant name/description, minimum CLI version and supported targets.                                                                                                                                             |
| `ToolMetadata`                               | ID/display/description/categories, upstream URL, maintainers/license, asset licenses and variants. `Validate(CategoryRegistry)` checks identities, bounded text, URLs and ordered matrices.                      |
| `AssetLicense`                               | Asset path/license and nullable source URL.                                                                                                                                                                      |
| `Category` / `CategoryRegistry`              | Category ID/label/description; schema and ordered categories. Registry `Validate()` rejects invalid or repeated IDs.                                                                                             |
| `BundleFile`                                 | Portable relative path, blob reference, mode (`0644`/`0755`) and text classification.                                                                                                                            |
| `BinarySummary`                              | Binary name and shim presence.                                                                                                                                                                                   |
| `ConfigurationKind` / `ConfigurationSummary` | Declaration kind, target, nullable source and display detail.                                                                                                                                                    |
| `TargetSummary`                              | Target, nullable installation method/version, dynamic-parameter flag, binaries/dependencies/configuration/hooks and elevation flag. `Validate()` checks target, method and ordered declarations.                 |
| `DefinitionManifest`                         | Schema/ID/variant/minimum CLI version, supported targets, files and complete summaries. `Validate()` checks matrix, file layout/bounds/modes/collisions; `Revision()` validates then hashes its canonical bytes. |
| `DefinitionRef`                              | Variant name, revision and manifest blob.                                                                                                                                                                        |
| `ToolDetail`                                 | Schema/source commit/path, metadata, definitions and verification history. `Validate(IndexEntry, CategoryRegistry, commit)` checks all cross-object bindings and latest-check projection.                        |
| `CheckOutcome`                               | Passed, failed or unavailable recorded outcome.                                                                                                                                                                  |
| `VerificationCheck`                          | Variant/revision/target, check/success timestamps, outcome, runner/CLI/software identities, descriptor digest, dependencies and log URL. No check is generated by this client.                                   |
| `VerificationDependency`                     | Provider ID/variant/revision.                                                                                                                                                                                    |
| `IndexDefinition`                            | Variant/revision/minimum CLI version, target/method summaries and latest target checks. `Validate()` checks identities, order and supported targets.                                                             |
| `IndexVerification`                          | Target, outcome, check timestamp and nullable successful timestamp.                                                                                                                                              |
| `IndexTarget`                                | Target and nullable installation method.                                                                                                                                                                         |
| `IndexEntry`                                 | Tool identity/display/categories/source/detail, definitions and display status. `Validate(CategoryRegistry)` checks the discovery entry.                                                                         |
| `Index`                                      | Schema and ordered entries. `Validate(categories, tombstones)` rejects retired active IDs and invalid entries.                                                                                                   |
| `Tombstone` / `TombstoneRegistry`            | Retired ID/reason/nullable replacement; schema and ordered tools. Registry `Validate()` checks retirement identity/order.                                                                                        |
| `SnapshotPayload`                            | Schema/source commit/generation time/minimum reader version and index/category/tombstone blobs. `Validate()` requires current reader/schema and bounded references.                                              |
| `Pointer`                                    | Schema and snapshot blob. `Validate()` checks schema and snapshot bounds.                                                                                                                                        |

## Shared behavioral corpus

`QueryFixtureBytes() []byte` returns a copy of the embedded query corpus. `QueryFixtureCorpus` contains schema, index and cases; `QueryCase` contains name, query, filters, page/limit and expected total/items; `ExpectedQueryItem` contains ID and matching definitions. These are synthetic behavioral records, never catalog verification evidence.
