import type { ToolConfigBuilder, ToolConfigContext } from '@types';
import { always } from '@types';

export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c.bin('lazygit')
    .version('latest')
    .install('github-release', {
      repo: 'jesseduffield/lazygit',
    })
    .symlink('02-configs/lazygit/config.yml', `${ctx.homeDir}/.config/lazygit/config.yml`)
    .zsh({
      shellInit: [always`alias g="lazygit"`],
    });
};
