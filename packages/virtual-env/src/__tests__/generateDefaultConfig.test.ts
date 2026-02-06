import { describe, expect, it } from 'bun:test';
import { generateDefaultConfig } from '../generateDefaultConfig';

describe('generateDefaultConfig', () => {
  it('should generate valid TypeScript config', () => {
    const config = generateDefaultConfig();

    expect(config).toMatchInlineSnapshot(`
      "import { defineConfig } from '@dotfiles/cli';

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
      });"
    `);
  });
});
