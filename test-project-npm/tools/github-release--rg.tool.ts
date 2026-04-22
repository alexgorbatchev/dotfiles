import { defineTool } from "@dotfiles/cli";

export default defineTool((install) =>
  install("github-release", { repo: "BurntSushi/ripgrep" })
    .bin("rg")
    .zsh((shell) =>
      // url downloads to toolInstallDir, source defaults to filename from URL
      shell.completions({
        url: "https://raw.githubusercontent.com/BurntSushi/ripgrep/master/crates/core/flags/complete/rg.zsh",
        source: "rg.zsh",
        bin: "rg",
      }),
    ),
);
