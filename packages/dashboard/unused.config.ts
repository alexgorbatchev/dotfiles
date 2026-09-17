import { defineConfig } from "ts-unused";

export default defineConfig({
  // src/index.ts is this workspace's public entry point, so anything re-exported
  // through it is part of the package surface rather than dead code.
  packageMode: true,

  ignoreFilePatterns: [
    // Generated from the Go structs by scripts/typegen; edit the Go types instead.
    "**/types.gen.ts",
    "**/*.d.ts",
    // Storybook stories are entry points of their own, referenced by title only.
    "**/stories/**",
    // pkg/vm is the DSL's public authoring surface, consumed by users' .tool.ts
    // files rather than from inside this repository.
    "**/pkg/vm/**",
  ],
});
