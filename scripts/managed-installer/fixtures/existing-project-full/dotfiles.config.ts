import { defineConfig } from "@alexgorbatchev/dotfiles";

export default defineConfig(({ configFileDir }) => ({
  paths: {
    dotfilesDir: configFileDir,
    toolConfigsDir: `${configFileDir}/tools`,
    generatedDir: `${configFileDir}/.generated`,
    targetDir: `${configFileDir}/bin`,
    binariesDir: `${configFileDir}/.generated/binaries`,
  },
}));
