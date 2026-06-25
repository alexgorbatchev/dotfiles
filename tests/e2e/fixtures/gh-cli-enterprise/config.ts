import { getE2eGeneratedDir } from "../../helpers/e2eGeneratedDir";

const generatedDir = getE2eGeneratedDir(import.meta.dirname);

/**
 * Config for testing GhCliApiClient with GitHub Enterprise.
 * Uses actual enterprise URL for github.host to test --hostname flag.
 * Binary downloads are handled by mock gh script which returns mock server URLs.
 */
export default {
  paths: {
    generatedDir,
    homeDir: "{paths.generatedDir}/user-home",
    targetDir: "{paths.generatedDir}/user-bin",
    toolConfigsDir: "{configFileDir}/tools",
  },
  github: {
    // GitHub Enterprise host - triggers --hostname flag in gh cli
    host: "https://api.github.enterprise.com",
    cache: {
      enabled: false,
    },
  },
  downloader: {
    cache: {
      enabled: false,
    },
  },
};
