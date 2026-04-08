import { getE2eGeneratedDir } from "../../helpers/e2eGeneratedDir";

// oxlint-disable-next-line import/no-default-export
const mockServerHost = process.env["MOCK_SERVER_PORT"]
  ? `http://127.0.0.1:${process.env["MOCK_SERVER_PORT"]}`
  : "http://127.0.0.1:8765";

const generatedDir = getE2eGeneratedDir(import.meta.dirname);

export default {
  paths: {
    generatedDir,
    homeDir: "{paths.generatedDir}/user-home",
    targetDir: "{paths.generatedDir}/user-bin",
    toolConfigsDir: "{configFileDir}",
  },
  github: {
    host: mockServerHost,
    cache: {
      enabled: false,
    },
  },
  cargo: {
    cratesIo: {
      host: mockServerHost,
      cache: {
        enabled: false,
      },
    },
    githubRaw: {
      host: mockServerHost,
      cache: {
        enabled: false,
      },
    },
    githubRelease: {
      host: mockServerHost,
      cache: {
        enabled: false,
      },
    },
  },
  downloader: {
    cache: {
      enabled: false,
    },
  },
};
