import type { AsyncConfigureTool, ToolConfigBuilder } from '@types'; // Adjusted import path
import { always } from '@types';

const configureLazygit: AsyncConfigureTool = async (c: ToolConfigBuilder): Promise<void> => {
  // Name is implicitly 'lazygit' (derived from the filename by the config loader)
  c.bin(['lazygit']);
  c.version('latest'); // Corresponds to `zinit light jesseduffield/lazygit`

  c.install('github-release', {
    repo: 'jesseduffield/lazygit',
    // assetPattern and binaryPath can often be inferred by the generator for common tools
    // or might need to be specified if the release structure is non-standard.
    // `zinit ice from=gh-r as=program` implies a direct binary or simple extraction.
  });

  c.symlink(
    '02-configs/lazygit/config.yml',
    // The generator will resolve ~ to the home directory.
    // Per ToolConfigSchema, target is relative to home.
    '.config/lazygit/config.yml'
  );

  // Adheres to the guideline: zshInit MUST be a single multi-line string (template literal).
  // The builder method is `zsh()` for this.
  c.zsh(always`
alias g="lazygit"
`);

  // No explicit completions found in the user's zsh files for lazygit.
  // If the tool provides them by default or via its GitHub release assets,
  // the generator might handle them, or they can be added here if needed.

  // updateCheck is enabled by default in the final ToolConfig object,
  // so no explicit builder call is needed unless overriding.
};

export default configureLazygit;
