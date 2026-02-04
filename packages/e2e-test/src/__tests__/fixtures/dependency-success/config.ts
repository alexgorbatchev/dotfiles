// oxlint-disable-next-line import/no-default-export
export default {
  paths: {
    generatedDir: '{configFileDir}/.generated',
    homeDir: '{paths.generatedDir}/user-home',
    targetDir: '{paths.generatedDir}/user-bin',
    toolConfigsDir: '{configFileDir}',
  },
  github: {
    host: 'http://127.0.0.1:8765',
    cache: {
      enabled: false,
    },
  },
  cargo: {
    cratesIo: {
      host: 'http://127.0.0.1:8765',
      cache: {
        enabled: false,
      },
    },
    githubRaw: {
      host: 'http://127.0.0.1:8765',
      cache: {
        enabled: false,
      },
    },
    githubRelease: {
      host: 'http://127.0.0.1:8765',
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
