import {
  defineTool,
  Platform,
  type HookEvent,
  type IAfterDownloadContext,
  type IAfterExtractContext,
  type IAfterInstallContext,
  type IBeforeInstallContext,
  type IDownloadContext,
  type IExtractContext,
  type IExtractResult,
  type IHookContext,
  type IToolConfigContext,
} from "@alexgorbatchev/dotfiles";
import { expectError, expectType } from "tsd";

// Stage-specific context interfaces provide required properties for each lifecycle phase.
defineTool((install) =>
  install("github-release", { repo: "owner/tool" })
    .hook("after-install", async (ctx) => {
      expectType<IAfterInstallContext>(ctx);
      expectType<string>(ctx.stagingDir);
      expectType<string>(ctx.installedDir);
      expectType<string[]>(ctx.binaryPaths);
      expectType<string | undefined>(ctx.version);
    })
    .hook("after-extract", async (ctx) => {
      expectType<IAfterExtractContext>(ctx);
      expectType<string>(ctx.stagingDir);
      expectType<string>(ctx.downloadPath);
      expectType<string>(ctx.extractDir);
      expectType<IExtractResult>(ctx.extractResult);
    })
    .hook("after-download", async (ctx) => {
      expectType<IAfterDownloadContext>(ctx);
      expectType<string>(ctx.stagingDir);
      expectType<string>(ctx.downloadPath);
    })
    .hook("before-install", async (ctx) => {
      expectType<IBeforeInstallContext>(ctx);
      expectType<string>(ctx.stagingDir);
    }),
);

// IAfterInstallContext, IExtractContext, and IDownloadContext can be imported and assigned to IHookContext.
declare const afterInstallCtx: IAfterInstallContext;
declare const extractCtx: IExtractContext;
declare const downloadCtx: IDownloadContext;

const hookCtx1: IHookContext = afterInstallCtx;
const hookCtx2: IHookContext = extractCtx;
const hookCtx3: IHookContext = downloadCtx;
expectType<IHookContext>(hookCtx1);
expectType<IHookContext>(hookCtx2);
expectType<IHookContext>(hookCtx3);

// Platform builder supports the same narrowed hook signatures.
defineTool((install) =>
  install("github-release", { repo: "owner/tool" }).platform(Platform.MacOS, (platInstall) =>
    platInstall()
      .hook("after-install", async (ctx) => {
        expectType<IAfterInstallContext>(ctx);
        expectType<string>(ctx.installedDir);
        expectType<string[]>(ctx.binaryPaths);
      })
      .hook("after-extract", async (ctx) => {
        expectType<IAfterExtractContext>(ctx);
        expectType<string>(ctx.extractDir);
        expectType<IExtractResult>(ctx.extractResult);
      })
      .hook("after-download", async (ctx) => {
        expectType<IAfterDownloadContext>(ctx);
        expectType<string>(ctx.downloadPath);
      })
      .hook("before-install", async (ctx) => {
        expectType<IBeforeInstallContext>(ctx);
      }),
  ),
);

// Fallback overload accepts HookEvent and IHookContext.
declare const dynamicEvent: HookEvent;
defineTool((install) =>
  install("manual").hook(dynamicEvent, async (ctx) => {
    expectType<IHookContext>(ctx);
  }),
);

// Shared helper functions across stages continue to accept ctx: IHookContext without union boilerplate.
const sharedHelper = async (ctx: IHookContext): Promise<void> => {
  ctx.log.info(`staging in ${ctx.stagingDir}`);
  await ctx.$`echo running`;
};

defineTool((install) =>
  install("manual")
    .hook("before-install", sharedHelper)
    .hook("after-download", sharedHelper)
    .hook("after-extract", sharedHelper)
    .hook("after-install", sharedHelper),
);

// A handler may annotate its parameter with the exported type.
defineTool((install) =>
  install("manual").hook("before-install", async ({ $, log }: IHookContext) => {
    await $`echo hello`;
    log.info("done");
  }),
);

// Hook-time `$` is the real shell executor, not the config-time template stub.
defineTool((install) =>
  install("manual").hook("after-install", async ({ $ }) => {
    const version: string = await $`tool --version`.text();
    expectType<string>(version);

    const result = await $`node --version`.noThrow();
    expectType<number>(result.exitCode);
    expectType<string>(result.stdout);
    expectType<string>(result.stderr);

    await $`tool init`.quiet();
    const parsed: unknown = await $`tool --json`.json();
    expectType<unknown>(parsed);

    // Modifiers chain and the chain is awaitable.
    const chained = await $`tool self-test`.quiet().noThrow();
    expectType<number>(chained.exitCode);
  }),
);

// The runtime method is `noThrow`; Bun's `nothrow` spelling does not exist here.
expectError(defineTool((install) => install("manual").hook("after-install", async ({ $ }) => $`x`.nothrow())));

// `fileSystem` is always present at hook time: no guard is needed to use it.
defineTool((install) =>
  install("manual").hook("after-install", async ({ fileSystem, installedDir }) => {
    await fileSystem.mkdir(`${installedDir}/share`);
    const entries: string[] = await fileSystem.readdir(`${installedDir}/share`);
    expectType<string[]>(entries);
  }),
);

// Only the four lifecycle events exist; a misspelled event is rejected at compile time
// just as the runtime rejects it at load time.
expectError(defineTool((install) => install("manual").hook("after-instal", async () => {})));
expectError(defineTool((install) => install("manual").hook("post-install", async () => {})));

// The tool factory context has no shell: configuration is read on every CLI invocation.
defineTool((install, ctx) => {
  expectType<IToolConfigContext>(ctx);
  expectError(ctx.$);
  return install();
});
