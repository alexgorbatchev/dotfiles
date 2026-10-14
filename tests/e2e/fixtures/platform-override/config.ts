import { defineConfig } from "@alexgorbatchev/dotfiles";

const generatedDir = `${import.meta.dirname}/.generated`;

export default defineConfig(() => ({
  paths: {
    generatedDir,
    homeDir: "{paths.generatedDir}/user-home",
    targetDir: "{paths.generatedDir}/user-bin",
    toolConfigsDir: "{configFileDir}/tools",
  },
  platform: [
    {
      match: [{ os: "macos", arch: "arm64" }],
      config: {
        paths: { targetDir: "{paths.generatedDir}/homebrew-bin" },
      },
    },
  ],
}));
