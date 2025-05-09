module.exports = {
  env: {
    browser: false,
    es2021: true,
    node: true,
  },
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    project: "./tsconfig.json", // Link to tsconfig for type-aware linting
  },
  plugins: ["@typescript-eslint"],
  rules: {
    // Add any project-specific rules here
    // Example:
    // '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  },
  ignorePatterns: ["node_modules/", "dist/", ".eslintrc.js"], // Ignore node_modules, build output, and this file itself
};
