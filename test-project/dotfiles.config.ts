import { defineConfig } from '@dotfiles/cli';

export default defineConfig(({ configFileDir }) => ({
  paths: {
    generatedDir: `${configFileDir}/.generated`,
    homeDir: '{paths.generatedDir}/user-home',
    targetDir: '{paths.generatedDir}/user-bin',
    toolConfigsDir: `${configFileDir}/tools`,
    binariesDir: '{paths.generatedDir}/binaries',
  },
  features: {
    catalog: {
      generate: true,
      filePath: `${configFileDir}/CATALOG.md`,
    },
  },
}));
