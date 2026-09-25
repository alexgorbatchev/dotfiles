import { defineTool, type IAfterInstallContext } from "@alexgorbatchev/dotfiles";

async function announce({ log, version }: IAfterInstallContext): Promise<void> {
  log.info(`installed ${version ?? "unknown"}`);
}

export default defineTool((install, ctx) =>
  install("github-release", { repo: "owner/consumer", token: process.env.GITHUB_TOKEN })
    .bin("consumer")
    .dependsOn("helper")
    .disable()
    .hook("after-install", announce)
    .zsh((shell) => shell.env({ CONSUMER_HOME: ctx.toolDir })),
);
