import { defineConfig } from "ts-unused";

export default defineConfig({
  // Custom patterns for identifying test files
  testFilePatterns: ["**/*.test-d.ts", "**/__tests__/**"],

  // Files to completely ignore during analysis
  ignoreFilePatterns: ["**/dist/**", "**/packages/cli/src/schema-exports.ts"],

  // Export names to ignore (supports glob patterns)
  ignoreExports: [],

  // Property names to ignore in interfaces/types
  ignoreProperties: [],

  // Type names to skip property analysis for
  ignoreTypes: [],

  // Whether to ignore module augmentation declarations
  // (declare module "..." blocks)
  ignoreModuleAugmentations: true,

  // Toggle specific analysis features
  analyzeExports: true,
  analyzeProperties: true,
  analyzeNeverReturnedTypes: true,
  detectUnusedFiles: true,
});
