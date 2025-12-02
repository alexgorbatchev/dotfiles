import { defineTool } from '@dotfiles/cli';

export default defineTool((install) =>
  install('manual', {}).bin('dependency-consumer').dependsOn('dependency-provider').version('1.0.0')
);
