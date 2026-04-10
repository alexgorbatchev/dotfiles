import { defineConfig } from "@alexgorbatchev/dotfiles";

export default defineConfig(({ configFileDir }) => ({
  paths: {
    dotfilesDir: configFileDir,
    toolConfigsDir: `${configFileDir}/tools`,
    generatedDir: `${configFileDir}/.generated`,
    targetDir: `${configFileDir}/bin`,
  },
  logging: {
    debug: "fixture-marker: existing-config-only",
  },
}));
