import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install()
    .symlink('id_rsa', '~/.ssh/id_rsa')
    .symlink('id_rsa.pub', '~/.ssh/id_rsa.pub')
    .hook('after-install', async ({ $ }) => {
      // Ensure proper permissions on SSH files
      await $`chmod 600 ~/.ssh/id_rsa`;
      await $`chmod 644 ~/.ssh/id_rsa.pub`;

      // Add SSH config include if not already present
      const configFile = '~/.ssh/config';
      const includePath = `${ctx.toolDir}/config`;

      await $`mkdir -p ~/.ssh`;
      await $`touch ${configFile}`;

      // Check if include already exists, if not add it
      const checkResult = await $`grep -qF "Include ${includePath}" ${configFile} || echo "NOT_FOUND"`.quiet();
      if (checkResult.stdout.includes('NOT_FOUND')) {
        await $`echo "Include ${includePath}" >> ${configFile}`;
      }

      // Add known hosts
      await $`ssh-keyscan -H "github.com" >> ~/.ssh/known_hosts 2>/dev/null || true`;
    })
    .zsh((shell) =>
      shell.always(/* zsh */ `
        # Start SSH agent if not running
        if [ -z "$SSH_AGENT_PID" ] || ! kill -0 $SSH_AGENT_PID 2>/dev/null; then
          eval "$(ssh-agent -s)" >/dev/null
        fi
      `)
    )
);
