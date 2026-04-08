import createOxlintConfig from "@alexgorbatchev/typescript-ai-policy/oxlint-config";

export default createOxlintConfig(() => ({
  ignorePatterns: ["**/.dist/**", "**/.generated/**", "**/.tmp/**", "**/node_modules/**", "**/tmp/**"],
  plugins: ["import"],
  rules: {
    "no-console": "error",
    "no-await-in-loop": "off",
    "import/no-default-export": "error",
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
        "no-unused-expressions": "off",
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
      files: ["**/*.tool.ts", "**/dotfiles.config.ts", "test-project/config.ts", "**/__tests__/**/config.ts"],
      rules: {
        "import/no-default-export": "off",
        "no-shadow": "off",
      },
    },
  ],
}));
