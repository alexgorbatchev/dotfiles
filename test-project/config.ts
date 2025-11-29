/** biome-ignore-all lint/suspicious/noTemplateCurlyInString: config */

import { defineConfig } from '../packages/cli';

export default defineConfig(({ configFileDir }) => ({
  paths: {
    generatedDir: `${configFileDir}/.generated`,
    homeDir: '${paths.generatedDir}/user-home',
    targetDir: '${paths.generatedDir}/bin',
    toolConfigsDir: `${configFileDir}/tools`,
  },
  features: {
    catalog: {
      generate: true,
      filePath: `${configFileDir}/CATALOG.md`,
    },
  },
}));
