import { defineTool } from "@dotfiles/cli";

export function createGithubReleaseFdTool() {
  return defineTool((install, ctx) =>
    install("github-release", { repo: "sharkdp/fd" })
      .bin("fd")
      .hook("after-install", async () => {
        ctx.log.trace("This is a TRACE message");
        ctx.log.debug("This is a DEBUG message");
        ctx.log.info("This is an INFO message");
        ctx.log.warn("This is a WARN message");
        ctx.log.error("This is an ERROR message");
      })
      .zsh((shell) =>
        shell.completions((ctx) => ({
          url: `https://raw.githubusercontent.com/sharkdp/fd/${ctx.version}/contrib/completion/_fd`,
          bin: "fd",
          source: "_fd",
        })),
      ),
  );
}
