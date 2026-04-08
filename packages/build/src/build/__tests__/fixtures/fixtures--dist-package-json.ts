/**
 * Test fixtures for generateDistPackageJson tests
 */

export const FIXTURE_SAMPLE_RUNTIME_DEPENDENCIES: Record<string, string> = {
  tslog: "4.8.1",
  zod: "3.22.4",
  memfs: "4.9.3",
};

export const FIXTURE_SAMPLE_DEPENDENCY_VERSIONS = {
  zod: "3.22.4",
  bunTypes: "1.0.1",
  nodeTypes: "20.10.5",
};

export const FIXTURE_EXPECTED_PACKAGE_JSON_SHAPE = {
  name: "@alexgorbatchev/dotfiles",
  type: "module",
  bin: {
    dotfiles: "./cli.js",
  },
  types: "./schemas.d.ts",
  exports: {
    ".": {
      import: {
        types: "./schemas.d.ts",
        default: "./cli.js",
      },
    },
  },
  files: ["cli.js", "cli.js.map", "schemas.d.ts", "tool-types.d.ts", "skill", "README.md", "LICENSE"],
};

export const FIXTURE_REQUIRED_DEPENDENCY_FIELDS = ["zod", "@types/bun", "@types/node"];
