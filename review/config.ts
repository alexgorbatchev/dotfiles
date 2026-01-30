import { defineConfig } from '@dotfiles/cli';

// oxlint-disable-next-line import/no-default-export
export default defineConfig(({ configFileDir }) => ({
  paths: {
    generatedDir: `${configFileDir}/.generated`,
    homeDir: '{paths.generatedDir}/user-home',
    targetDir: '{paths.generatedDir}/user-bin',
    toolConfigsDir: `${configFileDir}/review`,
    binariesDir: '{paths.generatedDir}/binaries',
  },
  features: {
    catalog: {
      generate: true,
      filePath: `${configFileDir}/CATALOG.md`,
    },
  },
}));
