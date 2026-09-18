import { defineTool, type IHookContext } from "@alexgorbatchev/dotfiles";

export default defineTool((install, _ctx) =>
  install("github-release", {
    repo: "sharkdp/bat",
    assetPattern: /^bat-.*\.tar\.gz$/,
  })
    .bin("bat")
    .hook("after-install", async ({ $ }: IHookContext) => {
      await $`bat --version`;
      await $`echo "bat installed successfully"`;
    })
    .zsh((shell) => {
      // Use cmd to generate completions dynamically since bat supports it
      return shell.completions({
        cmd: "bat --generate=completions zsh",
        bin: "bat",
      });
    }),
);
