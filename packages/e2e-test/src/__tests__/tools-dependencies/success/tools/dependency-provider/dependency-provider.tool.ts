import { defineTool } from '@dotfiles/cli';

export default defineTool((install) => install('manual', {}).bin('dependency-provider').version('1.0.0'));
