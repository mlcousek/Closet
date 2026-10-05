const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettier = require('eslint-config-prettier');

module.exports = defineConfig([
  expoConfig,
  prettier,
  { rules: { 'import/no-named-as-default-member': 'off' } },
  { ignores: ['dist/*', 'ios/*', 'android/*', '.expo/*', 'coverage/*'] },
]);
