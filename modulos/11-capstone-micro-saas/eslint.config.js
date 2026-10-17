// Lint do back-end e dos scripts (o front Angular tem o próprio toolchain e fica de fora).
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['app/web/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2025, sourceType: 'module', globals: { ...globals.node } },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }] },
  },
  // O teste de UI roda código dentro da página (document/window).
  { files: ['**/*.e2e.js'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
];
