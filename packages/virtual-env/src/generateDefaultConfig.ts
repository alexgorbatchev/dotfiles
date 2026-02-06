import { dedentString } from "@dotfiles/utils";

/**
 * Generates the default configuration file content for a virtual environment.
 *
 * The configuration uses relative paths based on the config file location
 * to ensure portability.
 *
 * @returns TypeScript configuration file content as a string
 */
export function generateDefaultConfig(): string {
  return dedentString(`
    import { defineConfig } from '@dotfiles/cli';

    export default defineConfig(({ configFileDir }) => {
      const generatedDir = \`\${configFileDir}/.generated\`;

      return {
        paths: {
          generatedDir,
          homeDir: \`\${generatedDir}/user-home\`,
          targetDir: \`\${generatedDir}/user-bin\`,
          toolConfigsDir: \`\${configFileDir}/tools\`,
          binariesDir: \`\${generatedDir}/binaries\`,
        },
      };
    });
  `);
}
