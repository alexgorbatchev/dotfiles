/**
 * Test fixtures for resolveRuntimeDependencies tests
 */

export const FIXTURE_EXTERNAL_DEPENDENCIES: string[] = ["tslog", "zod", "memfs"];

export const FIXTURE_INSTALLED_VERSIONS: Record<string, string> = {
  tslog: "4.8.1",
  zod: "3.22.4",
  memfs: "4.9.3",
  "@types/bun": "1.0.1",
  "@types/node": "20.10.5",
};

export const FIXTURE_EXPECTED_DEPENDENCY_VERSIONS = {
  zod: "3.22.4",
  bunTypes: "1.0.1",
  nodeTypes: "20.10.5",
};

export const FIXTURE_EXPECTED_RUNTIME_DEPENDENCY_VERSIONS: Record<string, string> = {
  tslog: "4.8.1",
  zod: "3.22.4",
  memfs: "4.9.3",
};
