import { defineTool, type IHookContext, type IToolConfigContext } from "@alexgorbatchev/dotfiles";
import { expectError, expectType } from "tsd";

// IHookContext is the single public hook context type: every event receives it, and the
// members an event does not provide are optional.
defineTool((install) =>
  install("github-release", { repo: "owner/tool" }).hook("after-install", async (context) => {
    expectType<IHookContext>(context);
    expectType<string>(context.stagingDir);
    expectType<string | undefined>(context.downloadPath);
    expectType<string | undefined>(context.extractDir);
    expectType<string | undefined>(context.installedDir);
    expectType<string[] | undefined>(context.binaryPaths);
    expectType<string | undefined>(context.version);
  }),
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
