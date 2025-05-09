import globals from 'globals';
import pluginTs from '@typescript-eslint/eslint-plugin';
import parserTs from '@typescript-eslint/parser';
import eslint from '@eslint/js';

export default [
  {
    ignores: ['node_modules/', 'dist/'],
  },
  eslint.configs.recommended,
  {
    languageOptions: {
      globals: globals.node,
      parser: parserTs,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': pluginTs,
    },
    rules: {
      ...pluginTs.configs['eslint-recommended'].rules,
      ...pluginTs.configs.recommended.rules,
      // Add any project-specific rules here
      // Example:
      // '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
];
