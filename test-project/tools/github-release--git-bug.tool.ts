import { defineTool } from "@dotfiles/cli";

/**
 * git-bug - Distributed bug tracker embedded in Git.
 *
 * https://github.com/git-bug/git-bug
 */
export default defineTool((install) =>
  install("github-release", {
    repo: "git-bug/git-bug",
    ghCli: true,
  }).bin("git-bug"),
);
