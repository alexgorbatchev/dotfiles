/**
 * @file generator/configs/tools/lazygit.tool.ts
 * @description Tool configuration for lazygit (a simple terminal UI for git commands).
 *
 * ## Development Plan
 *
 * ### Mandatory pre-read:
 * - [Porting Tool Configurations to \`*.tool.ts\`](memory-bank/techContext.md#L862-L893)
 *
 * ### Tasks:
 * - [x] Research lazygit installation and configuration (based on user's dotfiles: [`zshrc`](zshrc:0), [`01-init/git.zsh`](01-init/git.zsh:0), [`01-init/installers.zsh`](01-init/installers.zsh:0), [`02-configs/lazygit/`](02-configs/lazygit/)).
 * - [x] Define `AsyncConfigureTool` for lazygit using `ToolConfigBuilder`.
 *   - [x] Name is implicitly 'lazygit' from filename.
 *   - [x] Set binaries using `c.bin(['lazygit'])`.
 *   - [x] Set version using `c.version('latest')`.
 *   - [x] Configure `installMethod: 'github-release'` with `repo: 'jesseduffield/lazygit'` using `c.install()`.
 *   - [x] Set Zsh alias `g="lazygit"` using `c.zsh()` with a single template literal string.
 *   - [x] Configure symlink for `02-configs/lazygit/config.yml` to `~/.config/lazygit/config.yml` using `c.symlink()`.
 *   - [x] Configure `updateCheck` (enabled by default in builder/final config).
 *   - [x] Ensure no `environmentVariables` or `completions` are needed based on analysis.
 * - [x] Verify adherence to "Porting Tool Configurations to `*.tool.ts`" guidelines.
 * - [x] Write tests for the module. (N/A for `*.tool.ts` files; validated by TSC, Zod schema, and integration tests of config loader)
 * - [x] Cleanup all linting errors and warnings. (Verified by `bun lint`)
 * - [x] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [x] Ensure 100% test coverage for executable code. (N/A for `*.tool.ts` files)
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import type { AsyncConfigureTool, ToolConfigBuilder } from '../../types'; // Adjusted import path

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
  c.zsh(`
alias g="lazygit"
`);

  // No explicit completions found in the user's zsh files for lazygit.
  // If the tool provides them by default or via its GitHub release assets,
  // the generator might handle them, or they can be added here if needed.

  // updateCheck is enabled by default in the final ToolConfig object,
  // so no explicit builder call is needed unless overriding.
};

export default configureLazygit;
