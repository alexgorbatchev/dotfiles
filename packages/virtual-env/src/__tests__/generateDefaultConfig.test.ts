import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import assert from "node:assert";
import { generateDefaultConfig } from "../generateDefaultConfig";

describe("generateDefaultConfig", () => {
  const originalEnv = process.env.DOTFILES_BUILT_PACKAGE_NAME;

  beforeEach(() => {
    process.env.DOTFILES_BUILT_PACKAGE_NAME = "@test/dotfiles";
  });

  afterEach(() => {
    const restorePackageName = new Map<boolean, VoidFunction>([
      [
        true,
        () => {
          delete process.env.DOTFILES_BUILT_PACKAGE_NAME;
        },
      ],
      [
        false,
        () => {
          process.env.DOTFILES_BUILT_PACKAGE_NAME = originalEnv ?? "";
        },
      ],
    ]).get(originalEnv === undefined);

    assert(restorePackageName);
    restorePackageName();
  });

  it("should generate valid TypeScript config", () => {
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
