import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install, ctx) =>
  install("github-release", { repo: "sharkdp/fd" })
    .bin("fd")
    .hook("after-install", async () => {
      ctx.log.debug("This is a DEBUG message");
      ctx.log.info("This is an INFO message");
      ctx.log.warn("This is a WARN message");
      ctx.log.error("This is an ERROR message");
    })
    .zsh((shell) =>
      // Completions are generated from the installed binary, so they always match the
      // version that was installed.
      shell.completions({ cmd: "fd --gen-completions zsh", bin: "fd" }),
    ),
);
