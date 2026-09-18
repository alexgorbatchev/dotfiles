import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install("manual", { binaryPath: "./target-probe" })
    .bin("target-probe")
    .hook("after-install", async ({ fileSystem, projectConfig, systemInfo }) => {
      await fileSystem.writeFile(`${projectConfig.paths.generatedDir}/system-info.json`, JSON.stringify(systemInfo));
    }),
);
