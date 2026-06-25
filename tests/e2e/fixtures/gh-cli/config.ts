import { getE2eGeneratedDir } from "../../helpers/e2eGeneratedDir";

const generatedDir = getE2eGeneratedDir(import.meta.dirname);

/**
 * Config for testing GhCliApiClient with standard github.com.
 * Uses actual github.com URL for github.host to test that --hostname flag is NOT added.
 * The mock gh script returns download URLs pointing to the mock server (via MOCK_SERVER_PORT).
 */
export default {
  paths: {
    generatedDir,
    homeDir: "{paths.generatedDir}/user-home",
    targetDir: "{paths.generatedDir}/user-bin",
    toolConfigsDir: "{configFileDir}/tools",
  },
  github: {
    // Standard GitHub - should NOT trigger --hostname flag
    host: "https://api.github.com",
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
