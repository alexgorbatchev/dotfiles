import { defineTool } from '../../packages/cli';

export default defineTool((install, _ctx) => install('github-release', { repo: 'BurntSushi/ripgrep' }).bin('rg'));
