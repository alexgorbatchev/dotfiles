import { defineTool } from '@dotfiles/cli';

export default defineTool((install) =>
  install('github-release', {
    repo: 'repo/hook-test-tool',
  })
    .bin('hook-test-tool')
    .version('latest')
    .hook('after-install', async ({ $, toolName }) => {
      // Use shell to verify logging behavior - output should appear only once
      // via the logging shell (with `|` prefix), not duplicated with direct stdout
      await $`echo "shell-output-for-${toolName}"`;
      // Also run a script that outputs to both stdout and stderr
      await $`./scripts/test-output.sh`;    })
);
