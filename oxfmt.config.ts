import createOxfmtConfig from "@alexgorbatchev/typescript-ai-policy/oxfmt-config";

export default createOxfmtConfig(() => ({
  ignorePatterns: [
    "**/*.{json,jsonc,md}",
    "**/.dist/**",
    "**/.generated/**",
    "**/.tmp/**",
    "**/node_modules/**",
    "**/tmp/**",
  ],
}));
