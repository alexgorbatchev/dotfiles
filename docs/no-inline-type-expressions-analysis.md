# no-inline-type-expressions analysis

## Out of scope

This document does **not** perform any code changes. It only analyzes the current `@alexgorbatchev(no-inline-type-expressions)` diagnostics in `.tmp/index-fix-oxlint.json` and specifies where the eventual named types must live.

## CURRENT BASELINE

- Source of truth analyzed: `.tmp/index-fix-oxlint.json`
- Diagnostic code analyzed: `@alexgorbatchev(no-inline-type-expressions)`
- Current total: **338 diagnostics across 131 files**
- Reusable cross-file / cross-symbol contracts identified below: **181 diagnostics**
- Remaining diagnostics that should stay file-local: **157 diagnostics**

### Baseline observations

1. The largest repeated contracts are concentrated in:
   - CLI service-factory / combined option signatures
   - file-system method parameter contracts
   - downloader HTTP response-body / response-header contracts
   - shell helper signatures shared by real shell code and shell test doubles
   - dashboard server/client payload contracts
   - E2E test target descriptors
2. Several packages already have an obvious type owner but are still repeating inline expressions in implementations:
   - `packages/core/src/tool-config/shell/shellType.ts` already owns `ShellType`
   - `packages/downloader/IDownloader.ts` already owns `ProgressCallback`
   - `packages/core/src/builder/builder.types.ts` already owns `AsyncConfigureTool`
3. Several public APIs still expose inline object/union contracts from service interfaces or public types. Those need named package-owned types before implementation starts.

## REQUIRED REMEDIATION

### Grouped inventory

| Group | Diagnostics | Affected files | Reuse / create | Exact destination |
|---|---:|---|---|---|
| CLI services factory | 13 | `packages/cli/src/checkUpdatesCommand.ts`<br>`packages/cli/src/dashboardCommand.ts`<br>`packages/cli/src/binCommand.ts`<br>`packages/cli/src/cleanupCommand.ts`<br>`packages/cli/src/detectConflictsCommand.ts`<br>`packages/cli/src/featuresCommand.ts`<br>`packages/cli/src/updateCommand.ts`<br>`packages/cli/src/installCommand.ts`<br>`packages/cli/src/skillCommand.ts`<br>`packages/cli/src/cli.ts`<br>`packages/cli/src/filesCommand.ts`<br>`packages/cli/src/logCommand.ts`<br>`packages/cli/src/generateCommand.ts` | **Create** shared CLI type | `packages/cli/src/types.ts` → `export type IServicesFactory = () => Promise<IServices>;` |
| CLI combined command options | 17 | `packages/cli/src/filesCommand.ts`<br>`packages/cli/src/updateCommand.ts`<br>`packages/cli/src/cleanupCommand.ts`<br>`packages/cli/src/logCommand.ts`<br>`packages/cli/src/skillCommand.ts`<br>`packages/cli/src/installCommand.ts`<br>`packages/cli/src/envCommand.ts` | **Create** shared CLI command-option aliases | `packages/cli/src/types.ts` → `IFilesCommandOptions`, `IUpdateCommandOptions`, `ICleanupCommandOptions`, `ILogCommandOptions`, `ISkillCommandOptions`, `IInstallCommandOptions`, `IEnvCreateCommandOptions`, `IEnvDeleteCommandOptions` |
| Supported shell union | 8 | `packages/utils/src/resolvePlatformConfig.ts`<br>`packages/e2e-test/src/__tests__/helpers/TestHarness.ts` | **Reuse existing** | `packages/core/src/tool-config/shell/shellType.ts` → `ShellType` |
| Core shell helper signatures | 11 | `packages/core/src/shell/createShell.ts`<br>`packages/testing-helpers/src/createMock$.ts`<br>`packages/installer/src/utils/createConfiguredShell.ts`<br>`packages/installer-github/src/github-client/__tests__/helpers/createMockShell.ts` | **Create** shared shell helper types | `packages/core/src/shell/types.ts` → `ShellCommandInput`, `ShellCommandOnFulfilled<TResult1>`, `ShellCommandOnRejected<TResult2>`, `ShellCommandThenResult<TResult1, TResult2>` |
| File-system method parameter contracts | 31 | `packages/file-system/src/IFileSystem.ts` (existing inline owner to be normalized first)<br>`packages/file-system/src/NodeFileSystem.ts`<br>`packages/file-system/src/ResolvedFileSystem.ts`<br>`packages/file-system/src/MemFileSystem.ts`<br>`packages/file-system/src/__tests__/ResolvedFileSystem.test.ts`<br>`packages/registry/src/file/TrackedFileSystem.ts`<br>`packages/utils/src/formatPermissions.ts` | **Create** shared file-system types | `packages/file-system/src/types.ts` → `FileWriteContent`, `IRecursiveDirectoryOptions`, `IRemoveOptions`, `SymlinkKind`, `FileMode` |
| Tool binary entry | 6 | `packages/core/src/types.ts` (existing inline owner to be normalized)<br>`packages/config/src/loadToolConfigs.ts`<br>`packages/installer/src/utils/getBinaryPaths.ts`<br>`packages/installer/src/utils/getBinaryNames.ts`<br>`packages/installer/src/utils/normalizeBinaries.ts`<br>`packages/dashboard/src/server/routes/tools.ts`<br>`packages/utils/src/__tests__/generateToolTypes.test.ts` | **Create** shared core type | `packages/core/src/types.ts` → `export type ToolBinary = string | IBinaryConfig;` |
| Tool path mapping (`source` / `target`) | 4 current diagnostics, plus existing inline owner in core | `packages/core/src/types.ts` (existing inline owner to be normalized)<br>`packages/tool-config-builder/src/toolConfigBuilder.ts`<br>`packages/symlink-generator/src/__tests__/SymlinkGenerator.test.ts`<br>`packages/symlink-generator/src/__tests__/CopyGenerator.test.ts` | **Create** shared core type | `packages/core/src/types.ts` → `export interface IToolPathMapping { source: string; target: string; }` |
| Downloader HTTP response contracts | 29 | `packages/downloader/errors.ts`<br>`packages/downloader/log-messages.ts`<br>`packages/downloader/NodeFetchStrategy.ts` | **Create** shared downloader types | `packages/downloader/types.ts` → `HttpResponseBody`, `HttpHeaderValue`, `HttpHeadersMap` |
| Downloader progress callback | 3 | `packages/downloader/NodeFetchStrategy.ts` | **Reuse existing** | `packages/downloader/IDownloader.ts` → `ProgressCallback` |
| GitHub client release query / selection result | 4 | `packages/installer-github/src/github-client/GitHubApiClient.ts`<br>`packages/installer-github/src/github-client/GhCliApiClient.ts` | **Create** shared github-client types | `packages/installer-github/src/github-client/types.ts` → `IGitHubReleaseQueryOptions`, `IReleaseSelectionResult` |
| Gitea client option contracts | 2 | `packages/installer-gitea/src/gitea-client/GiteaApiClient.ts` | **Create** package-local client types | `packages/installer-gitea/src/gitea-client/types.ts` → `IGiteaApiClientOptions`, `IGiteaReleaseQueryOptions` |
| Config binary-lookup API result | 3 current diagnostics, plus existing inline service signature owner | `packages/config/src/IConfigService.ts` (existing inline owner to be normalized)<br>`packages/config/src/ConfigService.ts`<br>`packages/config/src/loadToolConfigs.ts` | **Create** shared config-package types | `packages/config/src/types.ts` → `ILoadToolConfigByBinaryError`, `LoadToolConfigByBinaryResult` |
| `defineTool` callback / return contract | 2 | `packages/cli/src/defineTool.ts` | **Reuse existing** | `packages/core/src/builder/builder.types.ts` → `AsyncConfigureTool` |
| Dashboard named tool-route request | 6 | `packages/dashboard/src/server/dashboard-server.ts` | **Create** shared server type | `packages/dashboard/src/server/types.ts` → `export type INamedToolRequest = Request & { params: { name: string } };` |
| Dashboard source / README payloads | 4 | `packages/dashboard/src/server/routes/tool-source.ts`<br>`packages/dashboard/src/server/routes/tool-readme.ts`<br>`packages/dashboard/src/client/components/ToolSourceCard.tsx`<br>`packages/dashboard/src/client/components/ReadmeCard.tsx` | **Create** shared dashboard payload types | `packages/dashboard/src/shared/types.ts` → `IToolSourcePayload`, `IToolReadmePayload` |
| Dashboard tool runtime status | 4 | `packages/dashboard/src/shared/types.ts` (owner to update)<br>`packages/dashboard/src/client/components/ToolsTreeView.tsx`<br>`packages/dashboard/src/client/components/__tests__/ToolsTreeView.test.tsx` | **Create** named shared status type | `packages/dashboard/src/shared/types.ts` → `export type ToolRuntimeStatus = "installed" | "not-installed" | "error";` |
| E2E test target descriptor | 13 | `packages/e2e-test/src/__tests__/versionDetection.test.ts`<br>`packages/e2e-test/src/__tests__/giteaRelease.test.ts`<br>`packages/e2e-test/src/__tests__/autoInstall.test.ts`<br>`packages/e2e-test/src/__tests__/dependency.test.ts`<br>`packages/e2e-test/src/__tests__/completion.test.ts`<br>`packages/e2e-test/src/__tests__/generate.test.ts`<br>`packages/e2e-test/src/__tests__/conflict.test.ts`<br>`packages/e2e-test/src/__tests__/install.test.ts`<br>`packages/e2e-test/src/__tests__/update.test.ts`<br>`packages/e2e-test/src/__tests__/trace.test.ts`<br>`packages/e2e-test/src/__tests__/files.test.ts`<br>`packages/e2e-test/src/__tests__/hook.test.ts`<br>`packages/e2e-test/src/__tests__/env.test.ts` | **Create** test-package helper type | `packages/e2e-test/src/__tests__/helpers/types.ts` → `export interface ITestTarget { platform: Platform; architecture: Architecture; name: string; }` |
| README service tool-config entry tuple | 4 | `packages/features/src/readme-service/ReadmeService.ts` | **Create** package-local type | `packages/features/src/readme-service/types.ts` → `export type ReadmeToolConfigEntry = [string, ToolConfig];` |
| Registry/file public result types | 2 current diagnostics, plus existing inline interface owner | `packages/registry/src/file/IFileRegistry.ts` (existing inline owner to be normalized)<br>`packages/registry/src/file/FileRegistry.ts` | **Create** shared registry/file types | `packages/registry/src/file/types.ts` → `IFileRegistryValidationResult`, `IFileRegistryStats` |
| HTTP proxy public helper types | 4 current diagnostics, plus existing inline interface owner | `packages/http-proxy/src/types.ts` (existing shared owner)<br>`packages/http-proxy/src/createProxyServer.ts` | **Create** shared proxy types | `packages/http-proxy/src/types.ts` → `ProxyCacheStatus`, `ProxyServerCallback`, `ProxyServerAddress` |
| Tool-config-builder helper types | 11 | `packages/tool-config-builder/src/toolConfigBuilder.ts` | **Create** package-local builder helper types | `packages/tool-config-builder/src/types.ts` → `MaybePromise<T>`, `ShellConfiguratorHandler`, `PlatformConfigureCallback`, `PlatformSelectorInput` |
| Symlink-generator required-`ToolConfig` variants | 2 | `packages/symlink-generator/src/SymlinkGenerator.ts`<br>`packages/symlink-generator/src/CopyGenerator.ts` | **Create** package-local generator guard types | `packages/symlink-generator/src/types.ts` → `ToolConfigWithSymlinks`, `ToolConfigWithCopies` |

### Exact remediation notes by reusable group

#### 1. CLI services / option composition

- `packages/cli/src/types.ts` is the correct owner for all CLI-only composition types.
- Add `IServicesFactory` once and replace every `() => Promise<IServices>` annotation with that alias.
- Add one named combined-options alias per command contract. Do **not** create one generic intersection alias and reuse it everywhere; the command-specific names are clearer and keep public CLI code explicit.

#### 2. Shell helper signatures

- `ShellType` already exists and must be imported instead of repeating the string union.
- `packages/core/src/shell/types.ts` is the correct owner for shell-call and `PromiseLike.then` helper aliases because the same contracts are implemented in:
  - the real shell runtime (`createShell.ts`)
  - installer wrapper code (`createConfiguredShell.ts`)
  - test doubles (`createMock$.ts`, `createMockShell.ts`)

#### 3. File-system parameter contracts

Normalize the public file-system surface first, then the implementations/tests:

1. add the named types in `packages/file-system/src/types.ts`
2. update `packages/file-system/src/IFileSystem.ts` to use those named types
3. update the concrete implementations and tests
4. update downstream consumers such as `TrackedFileSystem.ts` and `formatPermissions.ts`

The public owner must be `packages/file-system/src/types.ts`, not `TrackedFileSystem.ts`, because `TrackedFileSystem` depends on the file-system package and not vice versa.

#### 4. Core `ToolBinary` and `IToolPathMapping`

These are core tool-config contracts, not dashboard- or builder-owned contracts.

- `ToolBinary` belongs in `packages/core/src/types.ts` because it is used by config loading, installer utilities, and dashboard route helpers.
- `IToolPathMapping` belongs in `packages/core/src/types.ts` because core already owns the `symlinks` / `copies` tool-config surface.
- Do **not** reuse dashboard-only `ISerializableBinary` / `ISerializableSymlink` outside the dashboard package.

#### 5. Downloader HTTP response contracts

Create all three downloader-owned aliases together:

```ts
export type HttpResponseBody = string | Buffer | object;
export type HttpHeaderValue = string | string[] | undefined;
export type HttpHeadersMap = Record<string, HttpHeaderValue>;
```

These belong in `packages/downloader/types.ts` because the contracts are shared by downloader runtime code and downloader logging code.

#### 6. GitHub / Gitea client types

- GitHub client query and page-selection result types are shared between `GitHubApiClient.ts` and `GhCliApiClient.ts`, so they belong in `packages/installer-github/src/github-client/types.ts`.
- Gitea client option types currently only repeat inside `GiteaApiClient.ts`, but they are client-internal and belong in a colocated `packages/installer-gitea/src/gitea-client/types.ts`, not in the package root `src/types.ts` that already owns install-result types.

#### 7. Config binary-lookup result

`loadToolConfigByBinary()` is a public config-package contract. The error object `{ error: string }` is part of that API shape and needs a package-owned name.

Use:

```ts
export interface ILoadToolConfigByBinaryError {
  error: string;
}

export type LoadToolConfigByBinaryResult = ToolConfig | undefined | ILoadToolConfigByBinaryError;
```

Owner: `packages/config/src/types.ts`

Consumers to update first:
- `packages/config/src/IConfigService.ts`
- `packages/config/src/ConfigService.ts`
- `packages/config/src/loadToolConfigs.ts`
- then `packages/cli/src/installCommand.ts` if the local type guard is kept

#### 8. Dashboard shared contracts

- `INamedToolRequest` is server-only and belongs in `packages/dashboard/src/server/types.ts`.
- `IToolSourcePayload`, `IToolReadmePayload`, and `ToolRuntimeStatus` are shared between dashboard server routes and dashboard client components, so they belong in `packages/dashboard/src/shared/types.ts`.

#### 9. E2E test target descriptor

The repeated `{ platform, architecture, name }` shape is test-only. It must stay inside the E2E test helper area.

Owner: `packages/e2e-test/src/__tests__/helpers/types.ts` → `ITestTarget`

Do **not** move this into production packages.

#### 10. Registry/file public result contracts

`validate()` and `getStats()` are public `IFileRegistry` methods. Their return types need names in the `registry/file` package.

Owner: `packages/registry/src/file/types.ts`

Required names:
- `IFileRegistryValidationResult`
- `IFileRegistryStats`

#### 11. HTTP proxy helper types

`ProxyServer` is already a package API. Move the repeated callback / address / cache-status contracts into `packages/http-proxy/src/types.ts` and reuse them from `createProxyServer.ts`.

#### 12. Tool-config-builder helper types

These contracts are internal to the builder package and should stay in `packages/tool-config-builder/src/types.ts`:

- `MaybePromise<T>` for `this | Promise<this>`
- `ShellConfiguratorHandler` for `ShellConfiguratorCallback | ShellConfiguratorAsyncCallback`
- `PlatformConfigureCallback` for `(install: IPlatformInstallFunction) => Omit<PlatformConfigBuilderInterface, "bin">`
- `PlatformSelectorInput` for `Architecture | PlatformConfigureCallback`

#### 13. Symlink-generator guard types

`ToolConfig & { symlinks: ... }` and `ToolConfig & { copies: ... }` are package-internal narrowing contracts. They are shared across two generator implementations, so they belong in a new `packages/symlink-generator/src/types.ts`.

## One-off and local-only diagnostics

The remaining diagnostics should **not** be centralized into cross-package shared types. They either describe file-local helper shapes, test-only harness objects, or generic callback signatures with no stable domain owner.

### Local-only grouped inventory

| Local-only group | Diagnostics | Affected files | Required placement |
|---|---:|---|---|
| GitHub / Gitea API-client test helper mocks | 10 | `packages/installer-github/src/github-client/__tests__/helpers/sharedGitHubApiClientTestSetup.ts`<br>`packages/installer-gitea/src/gitea-client/__tests__/helpers/sharedGiteaApiClientTestSetup.ts`<br>`packages/installer-github/src/github-client/__tests__/GhCliApiClient.test.ts` | Keep local. Add file-local mock helper types such as `MockDownloader`, `MockCache`, `IGitHubConfigOverrideArgs`, `IBasicGitHubConfigArgs`, `IGitHubCacheConfigArgs`, `IGiteaApiClientTestSetupOptions`, `IGhCliCacheMock`. Do **not** create a shared cross-package test-mocks module. |
| Logger internals and logger tests | 20 | `packages/logger/src/SafeLogger.ts`<br>`packages/logger/src/TestLogger.ts`<br>`packages/logger/src/createTsLogger.ts`<br>`packages/logger/src/__tests__/createTsLogger--trace-flag.test.ts` | Keep local. Introduce `SafeLoggerMethodResult<TLogObj>` in `SafeLogger.ts`, `LogMatcher` in `TestLogger.ts`, `LoggerConfigInput` in `createTsLogger.ts`, and `ITraceTemplateLog` in the test file. |
| FileRegistry SQL helper rows | 7 | `packages/registry/src/file/FileRegistry.ts` | Keep local in `FileRegistry.ts`. Add `GeneratedFileOperationKeys`, `FileRegistrySqlValue`, `IOperationIdCountRow`, `ICountRow`, `ITimeRangeRow`. |
| TestHarness helper inputs and predicate unions | 6 | `packages/e2e-test/src/__tests__/helpers/TestHarness.ts` | Keep local in `TestHarness.ts`. Add `IRunCommandOptions`, `IVerifyShimOptions`, and `StringExpectation` (or separate `ValueExpectation` / `CommandExpectation` / `ContentExpectation` aliases if preferred). |
| curl-script test tuples / mock shell setup | 8 | `packages/installer-curl-script/src/__tests__/installFromCurlScript.test.ts` | Keep local in the test file. Add `ICurlScriptMockShell`, `ShellTemplateInvocation`, and `EnvInvocation`. |
| Config loader local helper contracts | 4 | `packages/config/src/loadToolConfigs.ts` | Keep local in `loadToolConfigs.ts`. Add `ToolConfigModuleExport` for `AsyncConfigureTool | AsyncConfigureToolWithReturn` and `IDiscoveredToolConfigFile` for `{ filePath; toolName }`. |
| Tool-config-builder remaining locals | 3 | `packages/tool-config-builder/src/toolConfigBuilder.ts` | Keep local to the builder file. Add `BuilderInstallParams`, `PlatformInstallArguments`, and `HostnamePattern`. Do not move `HostnamePattern` into logger or github test helpers; same syntax, different domain. |
| Downloader local helper/result types | 3 | `packages/downloader/Downloader.ts`<br>`packages/downloader/NodeFetchStrategy.ts` | Keep local. Add `DownloadAttemptResult`, `DownloadToFileAttemptResult`, and `ISetupDownloadRequestResult`. |
| Registry/file tracked-FS local helper objects | 2 | `packages/registry/src/file/TrackedFileSystem.ts` | Keep local in `TrackedFileSystem.ts`. Add `ITrackedFileStats` and `IRecordOperationOptions`. |
| Dashboard local response factories and test-only helpers | 11 | `packages/dashboard/src/server/dashboard-server.ts`<br>`packages/dashboard/src/testing-helpers/dashboardTestHelpers.ts`<br>`packages/dashboard/src/server/routes/__tests__/test-setup.ts`<br>`packages/dashboard/src/server/routes/__tests__/recent-tools.test.ts`<br>`packages/dashboard/src/server/routes/recent-tools.ts`<br>`packages/dashboard/src/client/hooks/__tests__/useFetch.test.ts`<br>`packages/dashboard/src/shared/__tests__/buildTreeByTool.test.ts`<br>`packages/dashboard/src/client/pages/ToolDetail.tsx`<br>`packages/dashboard/src/client/pages/Health.tsx`<br>`packages/dashboard/src/client/pages/Tools.tsx`<br>`packages/dashboard/src/client/components/RecentTools.tsx` | Keep local. Use file-local names such as `DashboardResponseFactory`, `MockToolConfigInput`, `IRecentToolName`, `IRecentToolFileStub`, `IUseFetchToolsPayload`, `IToolTreeInput`, `IToolDetailPlatformEntryProps`, `IHealthCheckCardProps`, `IUsageSectionProps`, `ITimestampSourceBadgeProps`. |
| Generic async test callback annotations | 8 | `packages/dashboard/src/server/__tests__/dashboard-relative-paths.test.ts`<br>`packages/config/src/__tests__/loadConfig--typescript-paths.test.ts`<br>`packages/config/src/__tests__/tsConfigLoader--context.test.ts`<br>`packages/config/src/__tests__/tsConfigLoader.test.ts`<br>`packages/config/src/__tests__/findToolByBinary.test.ts`<br>`packages/config/src/__tests__/loadConfig.test.ts`<br>`packages/cli/src/__tests__/dashboardCommand.test.ts` | Keep local. In each file either remove the annotation and let inference stand, or add a file-local alias like `CleanupFn` / `MockServerStopFn` / `StartServerFn`. Do not centralize these generic test callbacks. `packages/cli/src/__tests__/dashboardCommand.test.ts` also needs file-local `ServicesGetter` and `IDashboardServerLocation` aliases for its remaining inline signatures. |
| Testing-helper matcher result shapes | 4 | `packages/testing-helpers/src/FetchMockHelper.ts`<br>`packages/testing-helpers/src/matchers/toMatchLooseInlineSnapshot.ts` | Keep local. Add `MockResponseOmittedKeys` in `FetchMockHelper.ts`; add `LooseInlineSnapshotValidationResult` and `MatcherExecutionResult` in `toMatchLooseInlineSnapshot.ts`. |
| CLI `log` command local helper contracts | 5 | `packages/cli/src/logCommand.ts` | Keep local in `logCommand.ts`. Add `IOperationFilterResult`, `IFileStateLogInput`, `ILogMetadataInput`, and `OperationHistoryFormatterInput`. |
| HTTP proxy internal cache-path record | 2 | `packages/http-proxy/src/ProxyCacheStore.ts` | Keep local in `ProxyCacheStore.ts` as `ICacheFileRecord`. |
| Shell-emissions once-script descriptor | 2 | `packages/shell-emissions/src/renderer/BlockRenderer.ts` | Keep local in `BlockRenderer.ts` as `IOnceScriptEmissionRef`. |
| Build / unwrap / installer utility callbacks | 5 | `packages/build/src/build/handleBuildError.ts`<br>`packages/unwrap-value/src/resolveValue.ts`<br>`packages/installer/src/utils/withErrorHandling.ts`<br>`packages/installer/src/context/InstallContextFactory.ts`<br>`packages/shell-init-generator/src/shell-generators/ShellGeneratorFactory.ts` | Keep local. Use file-local aliases such as `BuildOperation`, `BuildFinallyCallback`, `ResolvableFunction<TParams, TReturn>`, `ErrorHandledOperation<T>`, `InstallEventHandler`, `ShellGeneratorFactory`. |
| Schema-local options objects | 2 | `packages/core/src/config/projectConfigSchema.ts` | Keep local in `projectConfigSchema.ts` as `ICacheSchemaDefaults` and `IHostSchemaOptions`. |
| Cargo client cache-resolution result | 1 | `packages/installer-cargo/src/cargo-client/CargoClient.ts` | Keep local in `CargoClient.ts` as `IResolvedCargoCacheOptions`. |
| Brew tap input | 1 | `packages/installer-brew/src/installFromBrew.ts` | Keep local in `installFromBrew.ts` as `BrewTapInput`. Do **not** reuse downloader `HttpHeaderValue`; same syntax, different meaning. |
| Miscellaneous single-file locals | 32 | `packages/cli/src/binCommand.ts`<br>`packages/cli/src/cli.ts`<br>`packages/cli/src/detectConflictsCommand.ts`<br>`packages/cli/src/installCommand.ts`<br>`packages/cli/src/__tests__/filesCommand--logger-context-propagation.test.ts`<br>`packages/cli/src/__tests__/filesCommand.test.ts`<br>`packages/core/src/__tests__/InstallerPluginRegistry--typescript-integration.test.ts`<br>`packages/core/src/shell/createShell.ts` (`(line: string) => void` only)<br>`packages/core/src/shell/__tests__/createShell.test.ts`<br>`packages/build/src/build/steps/testPackedBuild.ts`<br>`packages/downloader/cache/__tests__/helpers/mocks.ts`<br>`packages/downloader/__tests__/Downloader--cached.test.ts`<br>`packages/downloader/__tests__/NodeFetchStrategy.test.ts`<br>`packages/downloader/cache/__tests__/CachedDownloadStrategy.test.ts`<br>`packages/e2e-test/src/__tests__/helpers/mock-server/mockServer.ts`<br>`packages/e2e-test/src/__tests__/versionDetection.test.ts`<br>`packages/generator-orchestrator/src/__tests__/GeneratorOrchestrator.test.ts`<br>`packages/http-proxy/src/__tests__/createProxyServer.test.ts`<br>`packages/installer-curl-binary/src/__tests__/installFromCurlBinary.test.ts`<br>`packages/installer-dmg/src/__tests__/installFromDmg.test.ts`<br>`packages/installer-github/src/github-client/__tests__/helpers/createMockShell.ts`<br>`packages/installer/src/__tests__/Installer--path-precedence.test.ts`<br>`packages/installer/src/hooks/HookLifecycle.ts`<br>`packages/registry/src/tool/ToolInstallationRegistry.ts`<br>`packages/dashboard/src/server/routes/__tests__/tool-readme.test.ts`<br>`packages/dashboard/src/server/routes/__tests__/shell-integration.test.ts`<br>`packages/dashboard/src/client/pages/__tests__/tool-detail-utils.test.ts`<br>`packages/tool-config-builder/src/__tests__/toolConfigBuilder.test.ts`<br>`packages/tool-config-builder/src/ShellConfigurator.ts`<br>`packages/shell-init-generator/src/ShellInitGenerator.ts`<br>`packages/symlink-generator/src/CopyGenerator.ts` | Keep local. Introduce file-local names that match the immediate role: `IBinCommandArgs`, `ITrackedFileSystems`, `IDetectConflictsResult`, `IInstallLookupError`, `PrintMessage`, `INpmVersionConfig`, `LineHandler`, `ICreateShellTestPayload`, `IHealthResponseLike`, `IFetchCall`, `ProgressEventTuple`, `IHeaderMapper`, `ILoadProgress`, `MockServerMutator`, `IToolNameTemplateVars`, `IGeneratorToolVersion`, `ProxyRequestInput`, `ICurlBinaryShellMocks`, `IDmgShellMocks`, `EndpointMatcher`, `IInstallOutputLike`, `HookEntry`, `IToolInstallationColumn`, `ReadmeDownloadCall`, `IShellIntegrationToolName`, `IToolDetailStub`, `IToolConfigBuilderTestVersion`, `ShellPathGuard<T>`, `IGeneratedShellFile`, `CopyCreationResult`. |

## Recommended implementation order

1. **Normalize existing public type owners first**
   - `packages/core/src/types.ts`
   - `packages/core/src/shell/types.ts`
   - `packages/file-system/src/types.ts` (new)
   - `packages/downloader/types.ts` (new)
   - `packages/config/src/types.ts` (new)
   - `packages/dashboard/src/shared/types.ts`
   - `packages/dashboard/src/server/types.ts`
   - `packages/registry/src/file/types.ts` (new)
   - `packages/http-proxy/src/types.ts`
   - `packages/tool-config-builder/src/types.ts`
   - `packages/symlink-generator/src/types.ts` (new)
   - `packages/installer-github/src/github-client/types.ts` (new)
   - `packages/installer-gitea/src/gitea-client/types.ts` (new)
   - `packages/e2e-test/src/__tests__/helpers/types.ts` (new)
   - `packages/features/src/readme-service/types.ts`
2. **Update public interfaces and barrels immediately after adding each owner**
   - `packages/file-system/src/index.ts`
   - `packages/downloader/index.ts`
   - `packages/config/src/index.ts`
   - `packages/registry/src/file/index.ts`
   - `packages/symlink-generator/src/index.ts`
   - `packages/installer-github/src/github-client/index.ts`
   - `packages/installer-gitea/src/gitea-client/index.ts`
3. **Update the highest-fanout consumers next**
   - CLI command files using `IServicesFactory` and combined CLI option aliases
   - file-system implementations/tests and `TrackedFileSystem.ts`
   - downloader runtime/logging files
   - dashboard server/client payload consumers
4. **Update package-internal helpers after shared owners are stable**
   - `toolConfigBuilder.ts`
   - `GitHubApiClient.ts` / `GhCliApiClient.ts` / `GiteaApiClient.ts`
   - `ReadmeService.ts`
   - E2E test files using `ITestTarget`
5. **Finish with local-only cleanups**
   - logger internals
   - config loader helpers
   - curl-script tests
   - FileRegistry SQL-row helpers
   - remaining one-file callbacks / tuples / test doubles

## Definition of done for the eventual implementation

The implementation that follows this report is done only when all of the following are true:

- Every current `@alexgorbatchev(no-inline-type-expressions)` diagnostic from `.tmp/index-fix-oxlint.json` is removed.
- Every shared contract listed in the reusable inventory exists at the exact destination named above.
- No new cross-package “utility types” are introduced for test-only helper shapes that this report marks as local-only.
- New `types.ts` files are exported through the relevant `index.ts` barrel files, and no non-barrel logic is added to those `index.ts` files.
- Existing public interfaces (`IFileSystem`, `IConfigService`, `IFileRegistry`, dashboard shared types, proxy types) reference named types instead of inline object/union expressions.
- Test-only local helper aliases stay colocated in their test files or their immediate test-helper files.

## Explicit non-goals

- No production code changes are made by this document.
- No lint fixes besides planning are attempted here.
- No naming or API redesign beyond extracting named types for the existing contracts is proposed here.
- No cross-package shared test-helper package is proposed for duplicated test mocks; those remain package-local by design.
