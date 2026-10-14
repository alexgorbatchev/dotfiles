const mockServerHost = process.env["MOCK_SERVER_PORT"]
  ? `http://127.0.0.1:${process.env["MOCK_SERVER_PORT"]}`
  : "http://127.0.0.1:8765";

const generatedDir = `${import.meta.dirname}/.generated`;

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
    },
  },
  downloader: {
    cache: {
      enabled: false,
    },
  },
};
