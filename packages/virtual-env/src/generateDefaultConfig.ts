import { dedentString, getBuiltPackageName } from "@dotfiles/utils";

/**
 * Generates the default configuration file content for a virtual environment.
 *
 * The configuration uses relative paths based on the config file location
 * to ensure portability.
 *
 * @returns TypeScript configuration file content as a string
 */
export function generateDefaultConfig(): string {
  const packageName = getBuiltPackageName();

  return dedentString(`
    import { defineConfig } from '${packageName}';

    export default defineConfig(({ configFileDir }) => {
      const generatedDir = \`\${configFileDir}/.generated\`;

      return {
        paths: {
          generatedDir,
          targetDir: \`\${generatedDir}/user-bin\`,
          toolConfigsDir: \`\${configFileDir}/tools\`,
          binariesDir: \`\${generatedDir}/binaries\`,
        },
      };
    });
  `);
}
