import { defineTool } from "@dotfiles/cli";

/**
 * Tool used to test installing by binary name.
 * The tool name is 'install-by-binary-tool' but provides a binary called 'my-custom-binary'.
 * This allows testing the `dotfiles install my-custom-binary` feature.
 */
export default defineTool((install) =>
  install("github-release", {
    repo: "repo/install-by-binary-tool",
  })
    .bin("my-custom-binary")
    .version("latest"),
);
