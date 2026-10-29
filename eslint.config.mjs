// eslint.config.mjs
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '.agents/**',
      '.playwright-cli/**',
      'output/playwright/**',
      '.impeccable/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/web/public/*.js'],
    languageOptions: {
      globals: { localStorage: 'readonly', document: 'readonly', matchMedia: 'readonly' },
    },
  },
  {
    files: ['apps/web/src/**/*.tsx'],
    plugins: { 'react-refresh': reactRefresh },
    rules: { 'react-refresh/only-export-components': 'error' },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': 'allow-with-description' },
      ],
    },
  },
);
