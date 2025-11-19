/** biome-ignore-all lint/suspicious/noTemplateCurlyInString: config */

import { defineConfig } from '../packages/cli';

export default defineConfig(() => ({
  paths: {
    generatedDir: '${configFileDir}/.generated',
    homeDir: '${paths.generatedDir}/user-home',
    targetDir: '${paths.generatedDir}/user-bin',
    toolConfigsDir: '${configFileDir}/tools',
  },
  features: {
    catalog: {
      generate: true,
      filePath: '${configFileDir}/CATALOG.md',
    },
  },
}));
