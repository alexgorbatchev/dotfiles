import { getE2eGeneratedDir } from '../../helpers/e2eGeneratedDir';

const generatedDir = getE2eGeneratedDir(import.meta.dirname);

// oxlint-disable-next-line import/no-default-export
export default {
  paths: {
    generatedDir,
    homeDir: '{paths.generatedDir}/user-home',
    targetDir: '{paths.generatedDir}/user-bin',
    toolConfigsDir: '{configFileDir}/tools',
  },
};
