import { getE2eGeneratedDir } from "../../helpers/e2eGeneratedDir";

const mockServerHost = process.env["MOCK_SERVER_PORT"]
  ? `http://127.0.0.1:${process.env["MOCK_SERVER_PORT"]}`
  : "http://127.0.0.1:8765";

const generatedDir = getE2eGeneratedDir(import.meta.dirname);

export default {
  paths: {
    generatedDir,
    homeDir: "{paths.generatedDir}/user-home",
    targetDir: "{paths.generatedDir}/user-bin",
    toolConfigsDir: "{configFileDir}/tools",
  },
  github: {
    host: mockServerHost,
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
