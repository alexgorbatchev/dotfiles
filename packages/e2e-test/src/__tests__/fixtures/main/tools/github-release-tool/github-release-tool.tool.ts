import { defineTool } from "@dotfiles/cli";

export default defineTool((install) =>
  install("github-release", {
    repo: "repo/github-release-tool",
  })
    .bin("github-release-tool")
    .version("latest")
    .zsh((shell) =>
      shell
        .env({
          GITHUB_RELEASE_TOOL_DEFAULT_OPTS: "--color=fg",
          GITHUB_RELEASE_TOOL_OTHER_OPTS: "--arg=1",
        })
        .aliases({
          grt: 'github-release-tool --preview "ps -f -p {+}"',
        })
        .completions("./github-release-tool.completion.sh").once(/* zsh */ `
          echo "echo from github-release-tool"
        `).always(/* zsh */ `
          echo "always from github-release-tool"
        `),
    ),
);
