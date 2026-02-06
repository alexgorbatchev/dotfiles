import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { generateDefaultConfig } from '../generateDefaultConfig';

describe('generateDefaultConfig', () => {
  const originalEnv = process.env.DOTFILES_BUILT_PACKAGE_NAME;

  beforeEach(() => {
    process.env.DOTFILES_BUILT_PACKAGE_NAME = '@test/dotfiles';
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.DOTFILES_BUILT_PACKAGE_NAME;
    } else {
      process.env.DOTFILES_BUILT_PACKAGE_NAME = originalEnv;
    }
  });

  it('should generate valid TypeScript config', () => {
    const config = generateDefaultConfig();

    expect(config).toMatchInlineSnapshot(`
      "import { defineConfig } from '@test/dotfiles';

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
      });"
    `);
  });
});
