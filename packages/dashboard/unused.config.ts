import { defineConfig } from "ts-unused";

export default defineConfig({
  // Do not treat dashboard as a library package; audit internal shared types for dead code.
  packageMode: false,

  ignoreFilePatterns: [
    // Generated from the Go structs by scripts/typegen; edit the Go types instead.
    "**/types.gen.ts",
    "**/*.d.ts",
    // Storybook stories are entry points of their own, referenced by title only.
    "**/stories/**",
    // pkg/vm is the DSL's public authoring surface, consumed by users' .tool.ts
    // files rather than from inside this repository.
    "**/pkg/vm/**",
    // Test setup utility exported for use across UI test files.
    "**/packages/dashboard/src/testing/**",
  ],
});
