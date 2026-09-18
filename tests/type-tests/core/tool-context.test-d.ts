import { defineTool } from "@alexgorbatchev/dotfiles";
import { expectError, expectType } from "tsd";

// The members the runtime always populates are not optional, so the documented
// unguarded usages compile.
defineTool((install, ctx) => {
  expectType<string>(ctx.toolName);
  expectType<string>(ctx.toolDir);
  expectType<string>(ctx.currentDir);
  expectType<string>(ctx.stagingDir);
  expectType<string>(ctx.configFileDir);
  expectType<string>(ctx.projectConfig.paths.generatedDir);
  expectType<string>(ctx.projectConfig.paths.binariesDir);
  expectType<string>(ctx.projectConfig.paths.homeDir);

  // A non-optional toolDir keeps ShellPathGuard<T> inferable, so this no longer
  // collapses to `never`.
  return install("manual").zsh((shell) => shell.env({ TOOL_CONFIG_DIR: ctx.toolDir }));
});

// resolve() is on the context and returns the single matching path.
defineTool((install, ctx) => {
  const resolved: string = ctx.resolve("completions/*.zsh");
  expectType<string>(resolved);
  return install();
});

// The logger exposes exactly the levels the runtime implements.
defineTool((install, ctx) => {
  ctx.log.debug("d");
  ctx.log.info("i");
  ctx.log.warn("w");
  ctx.log.error("e");
  expectError(ctx.log.trace("t"));
  return install();
});

// Both spellings of the file system reach the same bindings.
defineTool((install, ctx) => {
  expectType<typeof ctx.fs>(ctx.fileSystem);
  return install();
});
