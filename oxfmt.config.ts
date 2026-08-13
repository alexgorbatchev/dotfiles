import createOxfmtConfig from "@alexgorbatchev/typescript-ai-policy/oxfmt-config";

export default createOxfmtConfig(() => ({
  ignorePatterns: [
    "**/.dist/**",
    "**/.generated/**",
    "**/.tmp/**",
    "**/node_modules/**",
    "**/tmp/**",
    "test-project/**/*.{json,jsonc,md}",
  ],
}));
