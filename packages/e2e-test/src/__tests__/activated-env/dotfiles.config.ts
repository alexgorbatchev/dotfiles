import { defineConfig } from '@dotfiles/cli';

export default defineConfig(({ configFileDir }) => {
  const generatedDir = `${configFileDir}/.generated`;

  return {
    paths: {
      generatedDir,
      targetDir: `${generatedDir}/user-bin`,
      toolConfigsDir: `${configFileDir}/tools`,
      binariesDir: `${generatedDir}/binaries`,
    },
  };
});
