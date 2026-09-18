import { defineConfig } from "@alexgorbatchev/dotfiles";
import { getE2eGeneratedDir } from "../../helpers/e2eGeneratedDir";

const generatedDir = getE2eGeneratedDir(import.meta.dirname);

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
