// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import security from 'eslint-plugin-security';
import securityNode from 'eslint-plugin-security-node';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs', 'test/setup-e2e.js'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  security.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    plugins: {
      'security-node': securityNode,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      "prettier/prettier": ["error", { endOfLine: "auto" }],
      // Security rules (eslint-plugin-security)
      'security/detect-object-injection': 'warn',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-unsafe-regex': 'error',
      'security/detect-buffer-noassert': 'error',
      // Security rules (eslint-plugin-security-node)
      'security-node/detect-possible-timing-attacks': 'warn',
      'security-node/detect-sql-injection': 'error',
      'security-node/detect-nosql-injection': 'error',
      'security-node/detect-eval-with-expr': 'error',
      'security-node/detect-child-process': 'warn',
      'security-node/detect-insecure-randomness': 'warn',
      'security-node/non-literal-reg-expr': 'warn',
    },
  },
);
