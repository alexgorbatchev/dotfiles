import createOxlintConfig from "@alexgorbatchev/typescript-ai-policy/oxlint-config";

export default createOxlintConfig(() => ({
  ignorePatterns: ["**/.dist/**", "**/.generated/**", "**/.tmp/**", "**/node_modules/**", "**/tmp/**"],
  plugins: ["import"],
  rules: {
    "no-console": "error",
    "no-await-in-loop": "off",
    "import/no-named-as-default": "warn",
    "typescript/no-non-null-assertion": "warn",
    "typescript/consistent-type-imports": "error",
    "unicorn/no-array-callback-reference": "off",
    "unicorn/no-await-expression-member": "off",
    "unicorn/prefer-top-level-await": "off",
    "no-unused-vars": [
      "warn",
      {
        vars: "all",
        varsIgnorePattern: "^_",
        args: "after-used",
        argsIgnorePattern: "^_",
        caughtErrors: "all",
        caughtErrorsIgnorePattern: "^_",
        ignoreRestSiblings: true,
      },
    ],
    "import/no-unassigned-import": ["error", { allow: ["@dotfiles/testing-helpers"] }],
  },
  overrides: [
    {
      files: ["**/*.test.ts", "**/*.test.tsx"],
      rules: {
        "typescript/no-non-null-assertion": "off",
      },
    },
    {
      files: ["packages/build/**/*.{ts,tsx,js,jsx,mts,cts}"],
      rules: {
        "no-console": "off",
      },
    },
    {
      files: ["packages/e2e-test/src/__tests__/**/*.ts"],
      rules: {
        "no-shadow": "off",
      },
    },
    {
      files: [
        "oxfmt.config.ts",
        "oxlint.config.ts",
        "**/*.tool.ts",
        "**/dotfiles.config.ts",
        "test-project/dotfiles.config.ts",
        "**/__tests__/**/dotfiles.config.ts",
      ],
      rules: {
        "no-shadow": "off",
      },
    },
  ],
}));
