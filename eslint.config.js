const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettier = require('eslint-config-prettier');

module.exports = defineConfig([
  expoConfig,
  prettier,
  { rules: { 'import/no-named-as-default-member': 'off' } },
  {
    // jest.mock factories must require modules inline and define throwaway components.
    files: ['**/__tests__/**', 'jest.setup.tsx'],
    rules: { '@typescript-eslint/no-require-imports': 'off', 'react/display-name': 'off' },
  },
  { ignores: ['dist/*', 'ios/*', 'android/*', '.expo/*', 'coverage/*'] },
]);
